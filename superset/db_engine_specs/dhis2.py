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
Allows connecting to DHIS2 instances via API with dynamic parameter support
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, TYPE_CHECKING
from urllib.parse import urlencode

import requests
from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
from flask_babel import gettext as __
from marshmallow import fields, Schema, validate

from superset.databases.schemas import EncryptedString
from superset.db_engine_specs.base import BaseEngineSpec
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from sqlalchemy import pool
from sqlalchemy.engine import default
from sqlalchemy.dialects import registry

logger = logging.getLogger(__name__)

# Register DHIS2 dialect with SQLAlchemy at import time
registry.register("dhis2", "superset.db_engine_specs.dhis2_dialect", "DHIS2Dialect")
registry.register("dhis2.dhis2", "superset.db_engine_specs.dhis2_dialect", "DHIS2Dialect")

if TYPE_CHECKING:
    from superset.models.core import Database


class DHIS2ParametersSchema(Schema):
    """Schema for DHIS2 connection parameters - fully dynamic configuration"""

    # Connection settings
    server = fields.Str(
        required=True,
        metadata={"description": __("DHIS2 server hostname (e.g., dhis2.hispuganda.org)")}
    )
    api_path = fields.Str(
        missing="/api",
        metadata={"description": __("API base path (e.g., /api or /hmis/api)")}
    )

    # Authentication
    auth_method = fields.Str(
        validate=validate.OneOf(["basic", "pat"]),
        missing="basic",
        metadata={"description": __("Authentication method: basic (username/password) or pat (Personal Access Token)")}
    )
    username = fields.Str(
        required=False,
        metadata={"description": __("DHIS2 username (required for basic auth)")}
    )
    password = EncryptedString(
        required=False,
        metadata={"description": __("DHIS2 password (required for basic auth)")}
    )
    access_token = EncryptedString(
        required=False,
        metadata={"description": __("Personal Access Token (required for PAT auth)")}
    )

    # Dynamic default parameters - applies to ALL endpoints
    default_params = fields.Dict(
        keys=fields.Str(),
        values=fields.Str(),
        missing={},
        metadata={
            "description": __("Default query parameters applied to all API endpoints"),
            "example": {
                "displayProperty": "NAME",
                "orgUnit": "USER_ORGUNIT",
                "period": "LAST_YEAR"
            }
        }
    )

    # Dynamic endpoint-specific parameters
    endpoint_params = fields.Dict(
        keys=fields.Str(),
        values=fields.Dict(keys=fields.Str(), values=fields.Str()),
        missing={},
        metadata={
            "description": __("Endpoint-specific query parameters (key: endpoint name, value: params dict)"),
            "example": {
                "analytics": {
                    "dimension": "dx:fbfJHSPpUQD;pe:LAST_YEAR;ou:USER_ORGUNIT",
                    "skipMeta": "false"
                },
                "dataValueSets": {
                    "dataSet": "rmaYTmNPkVA",
                    "period": "202508",
                    "orgUnit": "FvewOonC8lS"
                },
                "trackedEntityInstances": {
                    "ou": "USER_ORGUNIT",
                    "program": "IpHINAT79UW"
                }
            }
        }
    )

    # API settings
    timeout = fields.Int(
        missing=60,
        validate=validate.Range(min=1, max=300),
        metadata={"description": __("Request timeout in seconds")}
    )
    page_size = fields.Int(
        missing=50,
        validate=validate.Range(min=1, max=10000),
        metadata={"description": __("Default page size for paginated endpoints")}
    )


class DHIS2EngineSpec(BaseEngineSpec):
    """Engine specification for DHIS2 API connections with dynamic parameter support"""

    engine = "dhis2"
    engine_name = "DHIS2"
    drivers = {"dhis2": "DHIS2 API driver"}

    # DHIS2 specific settings
    allows_joins = False
    allows_subqueries = False
    allows_sql_comments = True  # Allow comments for parameter injection
    allows_alias_in_select = False
    allows_alias_in_orderby = False

    # Display settings
    default_driver = "dhis2"
    parameters_schema = DHIS2ParametersSchema()
    sqlalchemy_uri_placeholder = (
        "dhis2://username:password@play.dhis2.org/api or "
        "dhis2://username:password@play.dhis2.org/instance/api"
    )

    # Encryption parameters for credentials
    encrypted_extra_sensitive_fields = frozenset([
        "password",
        "access_token",
        "$.auth_params.access_token",
    ])

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
        Parse DHIS2 connection URI with support for instance paths

        Format: dhis2://username:password@server.dhis2.org/api
        Or with instance: dhis2://username:password@server.dhis2.org/instance/api

        Examples:
        - dhis2://admin:district@tests.dhis2.hispuganda.org/hmis/api
        - dhis2://admin:district@play.dhis2.org/40.2.2/api
        """
        from urllib.parse import urlparse

        parsed = urlparse(uri)

        # For DHIS2 instances like play.dhis2.org/40.2.2/api
        # We need to extract the full path and determine the API endpoint
        # The path could be /40.2.2/api or just /api
        path = parsed.path or "/api"

        # If path doesn't end with /api, append it
        if not path.endswith("/api"):
            if not path.endswith("/"):
                path = f"{path}/api"
            else:
                path = f"{path}api"

        return {
            "username": parsed.username,
            "password": parsed.password,
            "host": parsed.hostname,
            "port": parsed.port or 443,
            "path": path,
        }

    @classmethod
    def build_sqlalchemy_uri(
        cls,
        parameters: Dict[str, Any],
        encrypted_extra: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Build DHIS2 connection URI from parameters - supports multiple auth methods

        Parameters from UI:
        - server: e.g., "tests.dhis2.hispuganda.org"
        - api_path: e.g., "/hmis/api"
        - auth_method: "basic" or "pat"
        - username: DHIS2 username (for basic auth)
        - password: DHIS2 password (for basic auth)
        - access_token: Personal Access Token (for PAT auth)
        """
        server = parameters.get("server", "")
        api_path = parameters.get("api_path", "/api").strip()
        auth_method = parameters.get("auth_method", "basic")

        # Clean up api_path
        if not api_path.startswith("/"):
            api_path = f"/{api_path}"

        # Build credentials based on auth method
        if auth_method == "pat":
            # For PAT: use token as password, empty username
            credentials = f":{parameters.get('access_token', '')}"
        else:
            # For basic auth: username:password
            username = parameters.get("username", "")
            password = parameters.get("password", "")
            credentials = f"{username}:{password}"

        return f"dhis2://{credentials}@{server}{api_path}"

    @classmethod
    def get_parameters_from_uri(
        cls, uri: str, encrypted_extra: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Extract connection parameters from URI for display in UI
        Supports both basic auth and PAT methods
        """
        parsed = cls.parse_uri(uri)

        # Determine auth method based on username presence
        username = parsed.get("username", "")
        password = parsed.get("password", "")

        if not username and password:
            # Empty username with password = PAT auth
            auth_method = "pat"
            access_token = password
            username = ""
            password = ""
        else:
            auth_method = "basic"
            access_token = ""

        params = {
            "server": parsed.get("host", ""),
            "api_path": parsed.get("path", "/api"),
            "auth_method": auth_method,
            "username": username,
            "password": password,
            "access_token": access_token,
        }

        # Add dynamic parameters from encrypted_extra if present
        if encrypted_extra:
            params["default_params"] = encrypted_extra.get("default_params", {})
            params["endpoint_params"] = encrypted_extra.get("endpoint_params", {})
            params["timeout"] = encrypted_extra.get("timeout", 60)
            params["page_size"] = encrypted_extra.get("page_size", 50)

        return params

    @classmethod
    def validate_parameters(
        cls, parameters: Dict[str, Any]
    ) -> list[SupersetError]:
        """
        Validate connection parameters before saving - supports multiple auth methods
        """
        errors: list[SupersetError] = []

        # Server is always required
        if not parameters.get("server"):
            errors.append(
                SupersetError(
                    message=__("Server is required"),
                    error_type=SupersetErrorType.CONNECTION_MISSING_PARAMETERS_ERROR,
                    level=ErrorLevel.ERROR,
                    extra={"missing": ["server"]},
                )
            )

        # Validate auth-specific parameters
        auth_method = parameters.get("auth_method", "basic")

        if auth_method == "basic":
            # Basic auth requires username and password
            if not parameters.get("username"):
                errors.append(
                    SupersetError(
                        message=__("Username is required for basic authentication"),
                        error_type=SupersetErrorType.CONNECTION_MISSING_PARAMETERS_ERROR,
                        level=ErrorLevel.ERROR,
                        extra={"missing": ["username"]},
                    )
                )
            if not parameters.get("password"):
                errors.append(
                    SupersetError(
                        message=__("Password is required for basic authentication"),
                        error_type=SupersetErrorType.CONNECTION_MISSING_PARAMETERS_ERROR,
                        level=ErrorLevel.ERROR,
                        extra={"missing": ["password"]},
                    )
                )
        elif auth_method == "pat":
            # PAT requires access token
            if not parameters.get("access_token"):
                errors.append(
                    SupersetError(
                        message=__("Access token is required for PAT authentication"),
                        error_type=SupersetErrorType.CONNECTION_MISSING_PARAMETERS_ERROR,
                        level=ErrorLevel.ERROR,
                        extra={"missing": ["access_token"]},
                    )
                )

        return errors

    @classmethod
    def test_connection(cls, database: Database) -> None:
        """
        Test DHIS2 connection by calling /api/me endpoint
        Supports both basic auth and PAT authentication

        This method is called BEFORE Superset tries to query tables,
        so we just verify authentication works.
        """
        try:
            parsed = cls.parse_uri(database.sqlalchemy_uri_decrypted)
            base_url = f"https://{parsed['host']}{parsed['path']}"

            # Determine auth method based on credentials
            username = parsed.get("username", "")
            password = parsed.get("password", "")

            if not username and password:
                # PAT auth - send token as Bearer or in Authorization header
                auth = None
                headers = {"Authorization": f"ApiToken {password}"}
            else:
                # Basic auth
                auth = (username, password)
                headers = {}

            # Test connection with /api/me endpoint
            response = requests.get(
                f"{base_url}/me",
                auth=auth,
                headers=headers,
                timeout=10,
            )

            if response.status_code == 200:
                user_data = response.json()
                logger.info(f"DHIS2 connection successful - User: {user_data.get('username', 'unknown')}")
                # Connection successful - return normally
                return
            elif response.status_code == 401:
                raise Exception("Invalid credentials - check username/password or access token")
            else:
                raise Exception(f"Connection failed: HTTP {response.status_code}")

        except requests.exceptions.Timeout:
            raise Exception("Connection timeout - server not responding")
        except requests.exceptions.ConnectionError as e:
            raise Exception(f"Cannot connect to {base_url} - check server URL: {e}")
        except Exception as e:
            # Re-raise with clearer message
            error_msg = str(e)
            if "Invalid credentials" in error_msg or "Connection" in error_msg or "HTTP" in error_msg:
                raise
            raise Exception(f"Connection test failed: {error_msg}")

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
        Return ONLY data query endpoints for DHIS2
        Excludes metadata endpoints (used by Query Builder) and configuration endpoints

        Note: This is called during connection test and dataset creation.
        Returns only the 5 core data query endpoints.
        """
        # Return ONLY data query endpoints (same as dialect)
        return {
            "analytics",              # Aggregated analytical data (MOST COMMON)
            "dataValueSets",          # Raw data entry values
            "events",                 # Tracker program events
            "trackedEntityInstances", # Tracked entities (people, assets)
            "enrollments",            # Program enrollments
        }

    @classmethod
    def get_extra_params(cls, database: Database, source=None) -> Dict[str, Any]:
        """
        Extra parameters to include in database metadata
        Includes dynamic DHIS2-specific configuration
        """
        extra_params = {
            "engine_params": {
                "connect_args": {
                    "timeout": 60,
                }
            }
        }

        # Add DHIS2-specific parameters from database configuration
        try:
            import json
            extra = json.loads(database.extra) if database.extra else {}
            if "default_params" in extra:
                extra_params["default_params"] = extra["default_params"]
            if "endpoint_params" in extra:
                extra_params["endpoint_params"] = extra["endpoint_params"]
            if "page_size" in extra:
                extra_params["page_size"] = extra["page_size"]
        except Exception as e:
            logger.warning(f"Could not load DHIS2 extra params: {e}")

        return extra_params
