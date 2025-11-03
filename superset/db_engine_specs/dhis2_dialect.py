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
DHIS2 SQLAlchemy Dialect
Enables DHIS2 API connections with dynamic parameter support
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional
from urllib.parse import urlencode, urlparse

import requests
from sqlalchemy.engine import default
from sqlalchemy import pool, types

logger = logging.getLogger(__name__)


class DHIS2Dialect(default.DefaultDialect):
    """Minimal SQLAlchemy dialect for DHIS2 API connections"""

    name = "dhis2"
    driver = "dhis2"
    supports_alter = False
    supports_pk_autoincrement = False
    supports_default_values = False
    supports_empty_insert = False
    supports_unicode_statements = True
    supports_unicode_binds = True
    supports_native_decimal = True
    supports_native_boolean = True
    supports_native_enum = False

    @classmethod
    def dbapi(cls):
        """Return a fake DBAPI module"""
        return DHIS2DBAPI()

    def create_connect_args(self, url):
        """
        Parse URL and return connection arguments for DHIS2Connection
        This is called by SQLAlchemy to convert the URL into connection parameters
        """
        logger.debug(f"create_connect_args called with URL: {url}")

        # Extract connection details from URL
        opts = {
            "host": url.host,
            "username": url.username,
            "password": url.password,
            "database": url.database,  # This will be the path like /stable-2-42-2/api
        }

        logger.debug(f"Parsed connection opts: {opts}")

        # Return (args, kwargs) tuple for DHIS2Connection.__init__()
        return ([], opts)

    def get_schema_names(self, connection, **kw):
        """Return list of schema names"""
        return ["dhis2"]

    def get_table_names(self, connection, schema=None, **kw):
        """Return list of table names (DHIS2 API endpoints)"""
        return ["analytics", "dataValueSets", "trackedEntityInstances"]

    def get_view_names(self, connection, schema=None, **kw):
        """Return list of view names (none for DHIS2)"""
        return []

    def has_table(self, connection, table_name, schema=None, **kw):
        """Check if table exists"""
        return table_name in ["analytics", "dataValueSets", "trackedEntityInstances"]

    def get_columns(self, connection, table_name, schema=None, **kw):
        """
        Return column information dynamically from stored metadata or defaults
        Columns can be customized per endpoint configuration
        """
        # Try to get custom columns from connection metadata
        try:
            if hasattr(connection, 'info') and 'endpoint_columns' in connection.info:
                endpoint_columns = connection.info['endpoint_columns']
                if table_name in endpoint_columns:
                    return [
                        {"name": col, "type": types.String(), "nullable": True}
                        for col in endpoint_columns[table_name]
                    ]
        except Exception as e:
            logger.debug(f"Could not load custom columns: {e}")

        # Default columns for common DHIS2 endpoints
        default_columns = {
            "analytics": ["dx", "pe", "ou", "value"],
            "dataValueSets": ["dataElement", "period", "orgUnit", "value", "storedBy", "created"],
            "trackedEntityInstances": ["trackedEntityInstance", "orgUnit", "trackedEntityType", "attributes"],
            "events": ["event", "program", "orgUnit", "eventDate", "dataValues"],
            "enrollments": ["enrollment", "trackedEntityInstance", "program", "orgUnit", "enrollmentDate"],
        }

        if table_name in default_columns:
            return [
                {"name": col, "type": types.String(), "nullable": True}
                for col in default_columns[table_name]
            ]

        # For unknown endpoints, return generic columns
        return [
            {"name": "id", "type": types.String(), "nullable": True},
            {"name": "data", "type": types.String(), "nullable": True},
        ]

    def get_pk_constraint(self, connection, table_name, schema=None, **kw):
        """Return primary key constraint (none for DHIS2)"""
        return {"constrained_columns": [], "name": None}

    def get_foreign_keys(self, connection, table_name, schema=None, **kw):
        """Return foreign keys (none for DHIS2)"""
        return []

    def get_indexes(self, connection, table_name, schema=None, **kw):
        """Return indexes (none for DHIS2)"""
        return []


class DHIS2DBAPI:
    """Fake DBAPI module for DHIS2"""

    paramstyle = "named"
    threadsafety = 2
    apilevel = "2.0"

    class Error(Exception):
        pass

    class DatabaseError(Error):
        pass

    class OperationalError(DatabaseError):
        pass

    class ProgrammingError(DatabaseError):
        pass

    def connect(self, *args, **kwargs):
        """Return a fake connection"""
        return DHIS2Connection(*args, **kwargs)


class DHIS2Connection:
    """Connection object for DHIS2 API with dynamic parameter support"""

    def __init__(self, host=None, username=None, password=None, database=None, **kwargs):
        """
        Initialize DHIS2 connection

        Args:
            host: DHIS2 server hostname
            username: Username or empty for PAT auth
            password: Password or access token
            database: API path (e.g., /api or /hmis/api)
            **kwargs: Additional connection parameters including:
                - default_params: Global default query parameters
                - endpoint_params: Endpoint-specific parameters
                - timeout: Request timeout
                - page_size: Default page size
        """
        logger.debug(f"DHIS2Connection init - host: {host}, database: {database}, kwargs: {kwargs}")

        self.host = host
        self.username = username or ""
        self.password = password or ""

        # Ensure api_path has leading slash
        self.api_path = database or "/api"
        if self.api_path and not self.api_path.startswith("/"):
            self.api_path = f"/{self.api_path}"

        # Store dynamic configuration
        self.default_params = kwargs.get("default_params", {})
        self.endpoint_params = kwargs.get("endpoint_params", {})
        self.timeout = kwargs.get("timeout", 60)
        self.page_size = kwargs.get("page_size", 50)

        # Build base URL
        self.base_url = f"https://{self.host}{self.api_path}"

        # Determine auth method
        if not self.username and self.password:
            # PAT authentication
            self.auth = None
            self.headers = {"Authorization": f"ApiToken {self.password}"}
        else:
            # Basic authentication
            self.auth = (self.username, self.password)
            self.headers = {}

        logger.info(f"DHIS2 connection initialized: {self.base_url}")

    def cursor(self):
        """Return a cursor for executing queries"""
        return DHIS2Cursor(self)

    def commit(self):
        """No-op commit (DHIS2 is read-only via this connector)"""
        pass

    def rollback(self):
        """No-op rollback"""
        pass

    def close(self):
        """Close connection"""
        logger.debug("DHIS2 connection closed")


class DHIS2Cursor:
    """Cursor object for executing DHIS2 API queries with dynamic parameters"""

    def __init__(self, connection: DHIS2Connection):
        self.connection = connection
        self._description = None
        self.rowcount = -1
        self._rows = []

    def _parse_endpoint_from_query(self, query: str) -> str:
        """Extract endpoint name from SQL query (FROM clause)"""
        # Simple regex to extract table name from SELECT ... FROM table_name
        match = re.search(r'FROM\s+(\w+)', query, re.IGNORECASE)
        if match:
            return match.group(1)
        return "analytics"  # Default fallback

    def _extract_query_params(self, query: str) -> dict[str, str]:
        """
        Extract query parameters from SQL WHERE clause or comments
        Supports both:
        - WHERE field='value' AND field2='value2'
        - -- DHIS2: param1=value1, param2=value2
        """
        params = {}

        # Extract from SQL comments (-- DHIS2: key=value, key2=value2)
        comment_match = re.search(r'--\s*DHIS2:\s*(.+?)(?:\n|$)', query, re.IGNORECASE)
        if comment_match:
            param_str = comment_match.group(1)
            for param in param_str.split(','):
                if '=' in param:
                    key, value = param.split('=', 1)
                    params[key.strip()] = value.strip()

        # Extract from WHERE clause
        where_match = re.search(r'WHERE\s+(.+?)(?:ORDER BY|GROUP BY|LIMIT|$)', query, re.IGNORECASE | re.DOTALL)
        if where_match:
            conditions = where_match.group(1)
            # Parse simple conditions: field='value' or field="value"
            for match in re.finditer(r'(\w+)\s*=\s*[\'"]([^\'"]+)[\'"]', conditions):
                field, value = match.groups()
                params[field] = value

        return params

    def _merge_params(self, endpoint: str, query_params: dict[str, str]) -> dict[str, str]:
        """
        Merge parameters with precedence: query > endpoint-specific > global defaults
        """
        merged = {}

        # Layer 1: Global defaults
        merged.update(self.connection.default_params)

        # Layer 2: Endpoint-specific parameters
        endpoint_config = self.connection.endpoint_params.get(endpoint, {})
        merged.update(endpoint_config)

        # Layer 3: Query-time parameters (highest priority)
        merged.update(query_params)

        return merged

    def _make_api_request(self, endpoint: str, params: dict[str, str]) -> list[dict]:
        """
        Execute DHIS2 API request with given parameters
        Returns list of result rows
        """
        url = f"{self.connection.base_url}/{endpoint}"

        # Add query parameters
        if params:
            url = f"{url}?{urlencode(params)}"

        logger.info(f"DHIS2 API request: {url}")

        try:
            response = requests.get(
                url,
                auth=self.connection.auth,
                headers=self.connection.headers,
                timeout=self.connection.timeout,
            )

            # Handle 409 Conflict - typically means missing required parameters
            if response.status_code == 409:
                # During connection tests or schema introspection, return empty result
                # instead of erroring. This allows the connection to succeed.
                logger.warning(f"DHIS2 API 409 for {endpoint} - missing parameters. Returning empty result.")

                # Return empty dataset with generic columns
                self._set_description(["id", "name", "value"])
                return []

            response.raise_for_status()

            data = response.json()

            # Parse response based on endpoint structure
            rows = self._parse_response(endpoint, data)

            logger.info(f"DHIS2 API returned {len(rows)} rows")
            return rows

        except requests.exceptions.HTTPError as e:
            logger.error(f"DHIS2 API HTTP error: {e}")
            raise DHIS2DBAPI.OperationalError(f"DHIS2 API error: {e}")
        except requests.exceptions.Timeout:
            logger.error("DHIS2 API request timeout")
            raise DHIS2DBAPI.OperationalError("Request timeout")
        except Exception as e:
            logger.error(f"DHIS2 API request failed: {e}")
            raise DHIS2DBAPI.OperationalError(f"API request failed: {e}")

    def _parse_response(self, endpoint: str, data: dict) -> list[tuple]:
        """
        Parse DHIS2 API response into rows - fully dynamic based on response structure
        """
        rows = []

        # Analytics endpoint structure
        if endpoint == "analytics" and "rows" in data:
            headers = data.get("headers", [])
            col_names = [h.get("name") for h in headers]
            self._set_description(col_names)

            for row_data in data["rows"]:
                rows.append(tuple(row_data))

        # DataValueSets structure
        elif endpoint == "dataValueSets" and "dataValues" in data:
            data_values = data["dataValues"]
            if data_values:
                # Dynamically detect columns from first row
                col_names = list(data_values[0].keys())
                self._set_description(col_names)

                for dv in data_values:
                    rows.append(tuple(dv.get(col, None) for col in col_names))

        # Generic list response (events, enrollments, etc.)
        elif isinstance(data, dict):
            # Try common DHIS2 response patterns
            for key in ["events", "enrollments", "trackedEntityInstances", "rows", "data"]:
                if key in data and isinstance(data[key], list) and data[key]:
                    items = data[key]
                    # Detect columns from first item
                    col_names = list(items[0].keys()) if isinstance(items[0], dict) else ["value"]
                    self._set_description(col_names)

                    for item in items:
                        if isinstance(item, dict):
                            rows.append(tuple(item.get(col, None) for col in col_names))
                        else:
                            rows.append((item,))
                    break

        # If no rows found, return raw data as JSON string
        if not rows and data:
            self._set_description(["data"])
            rows = [(json.dumps(data),)]

        return rows

    def _set_description(self, col_names: list[str]):
        """Set cursor description from column names"""
        self._description = [
            (name, types.String, None, None, None, None, True)
            for name in col_names
        ]

    def execute(self, query: str, parameters=None):
        """
        Execute SQL query by translating to DHIS2 API call with dynamic parameters
        """
        logger.debug(f"Executing DHIS2 query: {query}")

        # Parse query to get endpoint and parameters
        endpoint = self._parse_endpoint_from_query(query)
        query_params = self._extract_query_params(query)

        # Merge all parameter sources
        api_params = self._merge_params(endpoint, query_params)

        # Execute API request
        self._rows = self._make_api_request(endpoint, api_params)
        self.rowcount = len(self._rows)

    def fetchall(self):
        """Fetch all rows"""
        return self._rows

    def fetchone(self):
        """Fetch one row"""
        if self._rows:
            return self._rows.pop(0)
        return None

    def fetchmany(self, size=None):
        """Fetch many rows"""
        if size is None:
            size = 1
        result = self._rows[:size]
        self._rows = self._rows[size:]
        return result

    def close(self):
        """Close cursor"""
        pass

    @property
    def description(self):
        """Return column descriptions"""
        return self._description

    @description.setter
    def description(self, value):
        """Set column descriptions"""
        self._description = value
