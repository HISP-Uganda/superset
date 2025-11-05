# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
import logging
from functools import partial
from typing import Any, Optional

from flask_appbuilder.models.sqla import Model
from marshmallow import ValidationError

from superset.commands.base import BaseCommand, CreateMixin
from superset.commands.dataset.exceptions import (
    DatabaseNotFoundValidationError,
    DatasetCreateFailedError,
    DatasetDataAccessIsNotAllowed,
    DatasetExistsValidationError,
    DatasetInvalidError,
    TableNotFoundValidationError,
)
from superset.daos.dataset import DatasetDAO
from superset.exceptions import SupersetParseError, SupersetSecurityException
from superset.extensions import security_manager
from superset.sql.parse import Table
from superset.utils.decorators import on_error, transaction

logger = logging.getLogger(__name__)


class CreateDatasetCommand(CreateMixin, BaseCommand):
    def __init__(self, data: dict[str, Any]):
        self._properties = data.copy()

    @transaction(on_error=partial(on_error, reraise=DatasetCreateFailedError))
    def run(self) -> Model:
        self.validate()

        database = self._properties.get("database")
        table_name = self._properties.get("table_name")
        sql = self._properties.get("sql")

        # Auto-convert DHIS2 datasets to virtual to preserve query parameters
        if database and database.backend == "dhis2":
            import re
            import json
            from urllib.parse import unquote

            # Case 1: SQL provided (from SQL Lab or with DHIS2 comment)
            if sql:
                # Extract DHIS2 parameters from SQL comment if present
                dhis2_params = None
                block_match = re.search(r'/\*\s*DHIS2:\s*(.+?)\s*\*/', sql, re.IGNORECASE | re.DOTALL)
                if block_match:
                    dhis2_params = block_match.group(1).strip()
                    dhis2_params = unquote(dhis2_params)
                else:
                    line_match = re.search(r'--\s*DHIS2:\s*(.+)', sql, re.IGNORECASE)
                    if line_match:
                        dhis2_params = line_match.group(1).strip()
                        dhis2_params = unquote(dhis2_params)

                if dhis2_params:
                    # Convert to virtual dataset
                    self._properties["is_sqllab_view"] = True

                    # Extract DHIS2 table name from SQL
                    from_match = re.search(r'FROM\s+(\w+)', sql, re.IGNORECASE)
                    dhis2_table = from_match.group(1) if from_match else table_name

                    # Store parameters in extra field for persistence across requests
                    existing_extra = self._properties.get("extra") or "{}"
                    try:
                        extra_dict = json.loads(existing_extra) if isinstance(existing_extra, str) else existing_extra
                    except json.JSONDecodeError:
                        extra_dict = {}

                    # Store parameters keyed by DHIS2 table name
                    if "dhis2_params" not in extra_dict:
                        extra_dict["dhis2_params"] = {}
                    extra_dict["dhis2_params"][dhis2_table] = dhis2_params

                    self._properties["extra"] = json.dumps(extra_dict)
                    logger.info(f"[DHIS2] Converting to virtual dataset with SQL: {sql[:200]}...")
                    logger.info(f"[DHIS2] Stored DHIS2 params in extra field for table: {dhis2_table}")
                    logger.info(f"[DHIS2] Parameters: {dhis2_params[:100]}")
                else:
                    # SQL provided but no DHIS2 comment - keep as-is
                    logger.info(f"[DHIS2] SQL provided without DHIS2 comment: {sql[:200]}")

            # Case 2: No SQL (from Query Builder physical dataset creation)
            # For DHIS2, we need to generate SQL from table_name to preserve it
            else:
                # Generate basic SQL with table name
                # The DHIS2 comment should be added by the frontend or API
                generated_sql = f"SELECT * FROM {table_name}"

                # Check if there are any default parameters in database config
                try:
                    extra = json.loads(database.extra) if database.extra else {}
                    default_params = extra.get("default_params", {})
                    endpoint_params = extra.get("endpoint_params", {})

                    # Build DHIS2 comment from database defaults if available
                    dhis2_comment_parts = []

                    # Add endpoint-specific params first
                    if table_name in endpoint_params:
                        for key, value in endpoint_params[table_name].items():
                            dhis2_comment_parts.append(f"{key}={value}")

                    # Add default params
                    for key, value in default_params.items():
                        dhis2_comment_parts.append(f"{key}={value}")

                    if dhis2_comment_parts:
                        dhis2_comment = "&".join(dhis2_comment_parts)
                        generated_sql = f"{generated_sql}\n/* DHIS2: {dhis2_comment} */"
                        logger.info(f"[DHIS2] Generated SQL with database defaults: {generated_sql[:200]}")
                except Exception as e:
                    logger.warning(f"[DHIS2] Could not load database defaults: {e}")

                # Convert to virtual dataset with generated SQL
                self._properties["sql"] = generated_sql
                self._properties["is_sqllab_view"] = True
                logger.info(f"[DHIS2] Auto-converted Query Builder dataset to virtual with SQL: {generated_sql[:200]}")

        dataset = DatasetDAO.create(attributes=self._properties)
        dataset.fetch_metadata()
        return dataset

    def validate(self) -> None:  # noqa: C901
        exceptions: list[ValidationError] = []
        database_id = self._properties["database"]
        catalog = self._properties.get("catalog")
        schema = self._properties.get("schema")
        table_name = self._properties["table_name"]
        sql = self._properties.get("sql")
        owner_ids: Optional[list[int]] = self._properties.get("owners")

        # Validate/Populate database
        database = DatasetDAO.get_database_by_id(database_id)
        if not database:
            exceptions.append(DatabaseNotFoundValidationError())
        self._properties["database"] = database

        # Validate uniqueness
        if database:
            if not catalog:
                catalog = self._properties["catalog"] = database.get_default_catalog()

            table = Table(table_name, schema, catalog)

            if not DatasetDAO.validate_uniqueness(database, table):
                exceptions.append(DatasetExistsValidationError(table))

        # Validate table exists on dataset if sql is not provided
        # This should be validated when the dataset is physical
        if (
            database
            and not sql
            and not DatasetDAO.validate_table_exists(database, table)
        ):
            exceptions.append(TableNotFoundValidationError(table))

        if sql:
            try:
                security_manager.raise_for_access(
                    database=database,
                    sql=sql,
                    catalog=catalog,
                    schema=schema,
                )
            except SupersetSecurityException as ex:
                exceptions.append(DatasetDataAccessIsNotAllowed(ex.error.message))
            except SupersetParseError as ex:
                exceptions.append(
                    ValidationError(
                        f"Invalid SQL: {ex.error.message}",
                        field_name="sql",
                    )
                )
        try:
            owners = self.populate_owners(owner_ids)
            self._properties["owners"] = owners
        except ValidationError as ex:
            exceptions.append(ex)
        if exceptions:
            raise DatasetInvalidError(exceptions=exceptions)
