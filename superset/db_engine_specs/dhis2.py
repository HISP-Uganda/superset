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
"""
DHIS2 Database Engine Specification
Allows connecting to DHIS2 instances via API
"""
from __future__ import annotations

from typing import Any, Dict, Optional, TYPE_CHECKING
import requests
from superset.db_engine_specs.base import BaseEngineSpec
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from sqlalchemy import pool
from sqlalchemy.engine import default
from sqlalchemy.dialects import registry

# Register DHIS2 dialect with SQLAlchemy at import time
registry.register("dhis2", "superset.db_engine_specs.dhis2_dialect", "DHIS2Dialect")
registry.register("dhis2.dhis2", "superset.db_engine_specs.dhis2_dialect", "DHIS2Dialect")

if TYPE_CHECKING:
    from superset.models.core import Database

class DHIS2EngineSpec(BaseEngineSpec):
    """Engine specification for DHIS2 API connections"""

    engine = "dhis2"
    engine_name = "DHIS2"
    drivers = {"dhis2": "DHIS2 API driver"}

    # DHIS2 specific settings
    allows_joins = False
    allows_subqueries = False
    allows_sql_comments = False
    allows_alias_in_select = False
    allows_alias_in_orderby = False

    # Display settings
    default_driver = "dhis2"
    sqlalchemy_uri_placeholder = "dhis2://username:password@server.dhis2.org/api"

    # Encryption parameters for credentials
    encrypted_extra_sensitive_fields = frozenset(["password", "api_token"])

    @classmethod
    def get_dbapi(cls):
        """
        Return the DBAPI module for DHIS2
        This allows connection creation without SQLAlchemy dialect registration
        """
        from superset.db_engine_specs.dhis2_dialect import DHIS2DBAPI
        return DHIS2DBAPI()

    @classmethod
    def get_dbapi_exception_mapping(cls) -> Dict[type[Exception], type[Exception]]:
        """Map DHIS2 API exceptions to database exceptions"""
        return {
            requests.exceptions.ConnectionError: Exception,
            requests.exceptions.Timeout: Exception,
            requests.exceptions.HTTPError: Exception,
        }

    @classmethod
    def parse_uri(cls, uri: str) -> Dict[str, Any]:
        """
        Parse DHIS2 connection URI

        Format: dhis2://username:password@server.dhis2.org/api
        Example: dhis2://admin:district@tests.dhis2.hispuganda.org/hmis/api
        """
        from urllib.parse import urlparse

        parsed = urlparse(uri)

        return {
            "username": parsed.username,
            "password": parsed.password,
            "host": parsed.hostname,
            "port": parsed.port or 443,
            "path": parsed.path or "/api",
        }

    @classmethod
    def build_sqlalchemy_uri(
        cls,
        parameters: Dict[str, Any],
        encrypted_extra: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Build DHIS2 connection URI from parameters

        Parameters from UI:
        - server: e.g., "tests.dhis2.hispuganda.org"
        - api_path: e.g., "/hmis/api"
        - username: DHIS2 username
        - password: DHIS2 password
        """
        server = parameters.get("server", "")
        api_path = parameters.get("api_path", "/api").strip()
        username = parameters.get("username", "")
        password = parameters.get("password", "")

        # Clean up api_path
        if not api_path.startswith("/"):
            api_path = f"/{api_path}"

        return f"dhis2://{username}:{password}@{server}{api_path}"

    @classmethod
    def get_parameters_from_uri(
        cls, uri: str, encrypted_extra: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Extract connection parameters from URI for display in UI
        """
        parsed = cls.parse_uri(uri)

        return {
            "server": parsed.get("host", ""),
            "api_path": parsed.get("path", "/api"),
            "username": parsed.get("username", ""),
            "password": parsed.get("password", ""),
        }

    @classmethod
    def validate_parameters(
        cls, parameters: Dict[str, Any]
    ) -> list[SupersetError]:
        """
        Validate connection parameters before saving
        """
        errors: list[SupersetError] = []

        required_fields = ["server", "username", "password"]
        for field in required_fields:
            if not parameters.get(field):
                errors.append(
                    SupersetError(
                        message=f"{field} is required",
                        error_type=SupersetErrorType.CONNECTION_MISSING_PARAMETERS_ERROR,
                        level=ErrorLevel.ERROR,
                        extra={"missing": [field]},
                    )
                )

        return errors

    @classmethod
    def test_connection(cls, database: Database) -> None:
        """
        Test DHIS2 connection by calling /api/me endpoint
        """
        parsed = cls.parse_uri(database.sqlalchemy_uri_decrypted)

        base_url = f"https://{parsed['host']}{parsed['path']}"

        try:
            # Test connection with /api/me endpoint
            response = requests.get(
                f"{base_url}/me",
                auth=(parsed["username"], parsed["password"]),
                timeout=10,
            )

            if response.status_code == 200:
                user_data = response.json()
                # Success! User authenticated
                return
            elif response.status_code == 401:
                raise Exception("Invalid username or password")
            else:
                raise Exception(f"Connection failed: HTTP {response.status_code}")

        except requests.exceptions.Timeout:
            raise Exception("Connection timeout - server not responding")
        except requests.exceptions.ConnectionError:
            raise Exception(f"Cannot connect to {base_url} - check server URL")
        except Exception as e:
            raise Exception(f"Connection test failed: {str(e)}")

    @classmethod
    def get_schema_names(cls, database: Database) -> list[str]:
        """
        Return list of schema names (DHIS2 only has one default schema)
        """
        return ["dhis2"]

    @classmethod
    def get_table_names(
        cls, database: Database, inspector, schema: Optional[str]
    ) -> set[str]:
        """
        Return available DHIS2 API endpoints as "tables"
        """
        return {
            "analytics",
            "dataValueSets",
            "trackedEntityInstances",
        }

    @classmethod
    def get_extra_params(cls, database: Database, source=None) -> Dict[str, Any]:
        """
        Extra parameters to include in database metadata
        """
        return {
            "engine_params": {
                "connect_args": {
                    "timeout": 60,
                }
            }
        }
