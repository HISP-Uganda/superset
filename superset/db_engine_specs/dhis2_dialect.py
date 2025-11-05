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
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlencode, urlparse

import requests
from sqlalchemy.engine import default
from sqlalchemy import pool, types

logger = logging.getLogger(__name__)


class DHIS2MappingDSL:
    """
    Simple JSONPath-like mapping DSL interpreter
    Supports basic path traversal and transforms without external dependencies
    """

    # Safe transform functions (no eval, only whitelisted functions)
    SAFE_TRANSFORMS = {
        "toNumber": lambda x: float(x) if x else None,
        "toInt": lambda x: int(x) if x else None,
        "toString": lambda x: str(x) if x is not None else "",
        "toUpper": lambda x: str(x).upper() if x else "",
        "toLower": lambda x: str(x).lower() if x else "",
        "trim": lambda x: str(x).strip() if x else "",
        "first": lambda x: x[0] if isinstance(x, list) and x else x,
        "last": lambda x: x[-1] if isinstance(x, list) and x else x,
        "length": lambda x: len(x) if x else 0,
        "sum": lambda x: sum(x) if isinstance(x, list) else x,
        "avg": lambda x: sum(x) / len(x) if isinstance(x, list) and x else 0,
        "join": lambda x: ",".join(str(i) for i in x) if isinstance(x, list) else str(x),
    }

    @classmethod
    def evaluate_path(cls, data: Any, path: str) -> list[Any]:
        """
        Evaluate JSONPath-like expression on data

        Supports:
        - Simple keys: "dataValues"
        - Nested keys: "dataValues.value"
        - Array indexing: "rows[0]"
        - Array wildcards: "dataValues[*]"
        - Array filters: "headers[?name='dx']"

        Returns list of matched values
        """
        if not path:
            return [data]

        parts = cls._parse_path(path)
        results = [data]

        for part in parts:
            results = cls._apply_part(results, part)

        return results

    @classmethod
    def _parse_path(cls, path: str) -> list[dict]:
        """Parse path into parts"""
        parts = []
        current = ""
        in_filter = False

        for char in path:
            if char == "[":
                if current:
                    parts.append({"type": "key", "value": current})
                    current = ""
                in_filter = True
                current = "["
            elif char == "]":
                current += "]"
                parts.append(cls._parse_bracket(current))
                current = ""
                in_filter = False
            elif char == "." and not in_filter:
                if current:
                    parts.append({"type": "key", "value": current})
                    current = ""
            else:
                current += char

        if current:
            parts.append({"type": "key", "value": current})

        return parts

    @classmethod
    def _parse_bracket(cls, bracket: str) -> dict:
        """Parse bracket expression like [0], [*], [?key='value']"""
        content = bracket[1:-1]

        if content == "*":
            return {"type": "wildcard"}
        elif content.isdigit():
            return {"type": "index", "value": int(content)}
        elif content.startswith("?"):
            # Simple filter: [?key='value'] or [?key="value"]
            filter_expr = content[1:]
            if "=" in filter_expr:
                key, value = filter_expr.split("=", 1)
                value = value.strip("'\"")
                return {"type": "filter", "key": key.strip(), "value": value}

        return {"type": "index", "value": 0}

    @classmethod
    def _apply_part(cls, results: list[Any], part: dict) -> list[Any]:
        """Apply a path part to current results"""
        new_results = []

        for item in results:
            if part["type"] == "key":
                # Simple key access
                if isinstance(item, dict):
                    value = item.get(part["value"])
                    if value is not None:
                        new_results.append(value)
                elif isinstance(item, list):
                    # Try to get key from each item in list
                    for sub_item in item:
                        if isinstance(sub_item, dict):
                            value = sub_item.get(part["value"])
                            if value is not None:
                                new_results.append(value)

            elif part["type"] == "index":
                # Array indexing
                if isinstance(item, list) and len(item) > part["value"]:
                    new_results.append(item[part["value"]])

            elif part["type"] == "wildcard":
                # Array wildcard
                if isinstance(item, list):
                    new_results.extend(item)
                else:
                    new_results.append(item)

            elif part["type"] == "filter":
                # Array filter
                if isinstance(item, list):
                    for sub_item in item:
                        if isinstance(sub_item, dict):
                            if sub_item.get(part["key"]) == part["value"]:
                                new_results.append(sub_item)

        return new_results

    @classmethod
    def apply_transform(cls, values: list[Any], transform: str) -> list[Any]:
        """Apply a transform function to values"""
        if transform not in cls.SAFE_TRANSFORMS:
            logger.warning(f"Unknown transform: {transform}, skipping")
            return values

        transform_fn = cls.SAFE_TRANSFORMS[transform]

        return [transform_fn(v) for v in values]

    @classmethod
    def apply_mapping(cls, data: dict, mapping: dict) -> Any:
        """
        Apply a mapping definition to data

        Mapping format:
        {
            "path": "dataValues[*].value",
            "transform": "toNumber",  # optional
            "default": None,  # optional
        }

        Returns first matched value or default
        """
        path = mapping.get("path", "")
        transform = mapping.get("transform")
        default = mapping.get("default")

        # Evaluate path
        results = cls.evaluate_path(data, path)

        # Apply transform if specified
        if transform and results:
            results = cls.apply_transform(results, transform)

        # Return first result or default
        return results[0] if results else default


class DHIS2EndpointDiscovery:
    """
    Dynamic endpoint discovery service with caching
    Queries /api/resources to fetch available endpoints
    """

    def __init__(self, base_url: str, auth: tuple | None, headers: dict, cache_ttl: int = 3600):
        """
        Initialize endpoint discovery service

        Args:
            base_url: DHIS2 API base URL (e.g., https://play.dhis2.org/api)
            auth: Authentication tuple (username, password) or None for PAT
            headers: HTTP headers (includes Authorization for PAT)
            cache_ttl: Cache time-to-live in seconds (default 1 hour)
        """
        self.base_url = base_url
        self.auth = auth
        self.headers = headers
        self.cache_ttl = cache_ttl
        self._cache = {}
        self._cache_time = None

    def discover_endpoints(self) -> list[str]:
        """
        Discover available DHIS2 API endpoints dynamically
        Falls back to static list if /api/resources is unavailable
        """
        # Check cache
        if self._is_cache_valid():
            logger.debug("Using cached endpoints")
            return self._cache.get("endpoints", self._get_fallback_endpoints())

        try:
            # Query DHIS2 /api/resources endpoint
            response = requests.get(
                f"{self.base_url}/resources",
                auth=self.auth,
                headers=self.headers,
                timeout=10,
            )

            if response.status_code == 200:
                data = response.json()
                resources = data.get("resources", [])

                # Extract endpoint names from resources
                endpoints = []
                for resource in resources:
                    # Resource structure: {"singular": "dataElement", "plural": "dataElements"}
                    if isinstance(resource, dict):
                        plural = resource.get("plural")
                        if plural:
                            endpoints.append(plural)
                    elif isinstance(resource, str):
                        endpoints.append(resource)

                # Add core analytics endpoints that might not be in resources
                core_endpoints = ["analytics", "dataValueSets"]
                for endpoint in core_endpoints:
                    if endpoint not in endpoints:
                        endpoints.append(endpoint)

                # Update cache
                self._cache["endpoints"] = endpoints
                self._cache_time = datetime.now()

                logger.info(f"Discovered {len(endpoints)} DHIS2 endpoints dynamically")
                return endpoints

        except Exception as e:
            logger.warning(f"Could not discover endpoints from /api/resources: {e}")

        # Fallback to static list
        return self._get_fallback_endpoints()

    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid based on TTL"""
        if not self._cache_time:
            return False
        age = (datetime.now() - self._cache_time).total_seconds()
        return age < self.cache_ttl

    def _get_fallback_endpoints(self) -> list[str]:
        """Static fallback list when dynamic discovery fails"""
        return [
            # Core analytics and data endpoints
            "analytics",
            "dataValueSets",
            "trackedEntityInstances",
            "events",
            "enrollments",
            # Metadata resources
            "dataElements",
            "dataSets",
            "indicators",
            "organisationUnits",
            "programs",
            "programStages",
            "programIndicators",
            # Other useful resources
            "categoryOptionCombos",
            "optionSets",
            "validationRules",
            "predictors",
        ]


class DHIS2ResponseNormalizer:
    """
    Endpoint-aware response normalizer
    Converts DHIS2 API responses into tabular format
    """

    @staticmethod
    def normalize_analytics(data: dict) -> tuple[list[str], list[tuple]]:
        """
        Normalize analytics endpoint response into PIVOTED/WIDE format

        Handles two response formats:
        1. Full dimensions (dx, pe, ou, value) - returned when using dimension parameters
        2. Partial dimensions (dx, value) - returned when using startDate/endDate filters

        Transforms from long format to wide format:
          Period, OrgUnit, DataElement_A, DataElement_B, DataElement_C
          202501, Adiland, 2, 5, 6
          202509, Gulu, 4, 4, 5

        Returns:
            Tuple of (column_names, rows)
        """
        headers = data.get("headers", [])
        rows_data = data.get("rows", [])
        metadata = data.get("metaData", {})

        if not rows_data:
            return ["Period", "OrgUnit"], []

        # Map UIDs to readable names from metadata
        items = metadata.get("items", {})

        def get_name(uid: str) -> str:
            """Get human-readable name for UID"""
            item = items.get(uid, {})
            return item.get("name", uid)

        # Find column indices - handle missing dimensions
        col_map = {}
        for idx, h in enumerate(headers):
            col_map[h.get("name", h.get("column"))] = idx

        dx_idx = col_map.get("dx")
        pe_idx = col_map.get("pe")
        ou_idx = col_map.get("ou")
        value_idx = col_map.get("value")

        # Check if we have all required dimensions for pivoting
        has_full_dimensions = dx_idx is not None and pe_idx is not None and ou_idx is not None

        if not has_full_dimensions:
            # Simplified format - just return as-is with readable column names
            col_names = []
            for h in headers:
                name = h.get("name", h.get("column", "value"))
                if name == "dx":
                    col_names.append("Data")
                elif name == "value":
                    col_names.append("Value")
                else:
                    col_names.append(name)

            # Convert rows, mapping dx UIDs to names
            converted_rows = []
            for row in rows_data:
                converted_row = []
                for idx, val in enumerate(row):
                    if idx == dx_idx and val:
                        converted_row.append(get_name(val))
                    else:
                        converted_row.append(val)
                converted_rows.append(tuple(converted_row))

            return col_names, converted_rows

        # Full pivot logic - we have dx, pe, ou, value
        # Collect all unique data elements, periods, org units
        data_elements = set()
        periods = set()
        org_units = set()

        for row in rows_data:
            if len(row) > max(dx_idx, pe_idx, ou_idx):
                data_elements.add(row[dx_idx])
                periods.add(row[pe_idx])
                org_units.add(row[ou_idx])

        # Build pivot structure: {(period, orgUnit): {dataElement: value}}
        pivot_data = {}
        for row in rows_data:
            if len(row) > max(dx_idx, pe_idx, ou_idx, value_idx):
                dx = row[dx_idx]
                pe = row[pe_idx]
                ou = row[ou_idx]
                val = row[value_idx]

                # Convert string values to numbers for numeric data
                if val is not None and val != '':
                    try:
                        # Try float first (handles both int and float)
                        val = float(val)
                        # Convert to int if it's a whole number
                        if val.is_integer():
                            val = int(val)
                    except (ValueError, AttributeError):
                        # Keep as string if conversion fails
                        pass

                key = (pe, ou)
                if key not in pivot_data:
                    pivot_data[key] = {}
                pivot_data[key][dx] = val

        # Build column names: Period, OrgUnit, DataElement_1, DataElement_2, ...
        # Sanitize data element names to avoid SQL errors from special characters
        def sanitize_column_name(name: str) -> str:
            """Remove special characters that cause SQL issues"""
            import re
            # Remove parentheses and other special chars
            name = re.sub(r'[()]+', '', name)
            # Replace multiple spaces with single space
            name = re.sub(r'\s+', ' ', name)
            # Trim whitespace
            name = name.strip()
            return name

        data_element_list = sorted(data_elements)
        col_names = ["Period", "OrgUnit"] + [sanitize_column_name(get_name(de)) for de in data_element_list]

        # Build rows
        pivoted_rows = []
        for (pe, ou) in sorted(pivot_data.keys()):
            row = [get_name(pe), get_name(ou)]
            for de in data_element_list:
                row.append(pivot_data[(pe, ou)].get(de, None))
            pivoted_rows.append(tuple(row))

        return col_names, pivoted_rows

    @staticmethod
    def normalize_data_value_sets(data: dict) -> tuple[list[str], list[tuple]]:
        """
        Normalize dataValueSets endpoint response

        Returns:
            Tuple of (column_names, rows)
        """
        data_values = data.get("dataValues", [])

        if not data_values:
            return ["dataElement", "period", "orgUnit", "value"], []

        # Dynamically detect columns from first row
        col_names = list(data_values[0].keys())

        rows = []
        for dv in data_values:
            rows.append(tuple(dv.get(col, None) for col in col_names))

        return col_names, rows

    @staticmethod
    def normalize_events(data: dict) -> tuple[list[str], list[tuple]]:
        """
        Normalize events endpoint response
        Flattens nested dataValues structure

        Returns:
            Tuple of (column_names, rows)
        """
        events = data.get("events", [])

        if not events:
            return ["event", "program", "orgUnit", "eventDate"], []

        # Extract base columns + dataValues
        base_cols = ["event", "program", "orgUnit", "eventDate", "status"]

        # Collect all unique dataElement IDs from all events
        data_element_ids = set()
        for event in events:
            for dv in event.get("dataValues", []):
                data_element_ids.add(dv.get("dataElement"))

        col_names = base_cols + sorted(data_element_ids)

        rows = []
        for event in events:
            row = [
                event.get("event"),
                event.get("program"),
                event.get("orgUnit"),
                event.get("eventDate"),
                event.get("status"),
            ]

            # Build dict of dataElement -> value
            dv_dict = {
                dv.get("dataElement"): dv.get("value")
                for dv in event.get("dataValues", [])
            }

            # Append values for each dataElement column
            for de_id in sorted(data_element_ids):
                row.append(dv_dict.get(de_id))

            rows.append(tuple(row))

        return col_names, rows

    @staticmethod
    def normalize_tracked_entity_instances(data: dict) -> tuple[list[str], list[tuple]]:
        """
        Normalize trackedEntityInstances endpoint response
        Flattens nested attributes structure

        Returns:
            Tuple of (column_names, rows)
        """
        teis = data.get("trackedEntityInstances", [])

        if not teis:
            return ["trackedEntityInstance", "orgUnit", "trackedEntityType"], []

        # Extract base columns + attributes
        base_cols = ["trackedEntityInstance", "orgUnit", "trackedEntityType"]

        # Collect all unique attribute IDs
        attribute_ids = set()
        for tei in teis:
            for attr in tei.get("attributes", []):
                attribute_ids.add(attr.get("attribute"))

        col_names = base_cols + sorted(attribute_ids)

        rows = []
        for tei in teis:
            row = [
                tei.get("trackedEntityInstance"),
                tei.get("orgUnit"),
                tei.get("trackedEntityType"),
            ]

            # Build dict of attribute -> value
            attr_dict = {
                attr.get("attribute"): attr.get("value")
                for attr in tei.get("attributes", [])
            }

            # Append values for each attribute column
            for attr_id in sorted(attribute_ids):
                row.append(attr_dict.get(attr_id))

            rows.append(tuple(row))

        return col_names, rows

    @staticmethod
    def normalize_metadata_list(data: dict, endpoint: str) -> tuple[list[str], list[tuple]]:
        """
        Normalize metadata endpoint responses (dataElements, dataSets, etc.)

        Returns:
            Tuple of (column_names, rows)
        """
        # Try plural form first
        items = data.get(endpoint, [])

        # Common metadata columns
        if not items:
            return ["id", "name", "displayName"], []

        # Detect columns from first item
        if isinstance(items[0], dict):
            col_names = list(items[0].keys())
        else:
            col_names = ["value"]

        rows = []
        for item in items:
            if isinstance(item, dict):
                rows.append(tuple(item.get(col, None) for col in col_names))
            else:
                rows.append((item,))

        return col_names, rows

    @staticmethod
    def normalize_generic(data: dict) -> tuple[list[str], list[tuple]]:
        """
        Generic fallback normalizer for unknown endpoints
        Tries common DHIS2 response patterns

        Returns:
            Tuple of (column_names, rows)
        """
        # Try common DHIS2 response patterns
        for key in ["rows", "data", "results"]:
            if key in data and isinstance(data[key], list) and data[key]:
                items = data[key]

                if isinstance(items[0], dict):
                    col_names = list(items[0].keys())
                    rows = [tuple(item.get(col, None) for col in col_names) for item in items]
                else:
                    col_names = ["value"]
                    rows = [(item,) for item in items]

                return col_names, rows

        # Last resort: return raw JSON as single column
        return ["data"], [(json.dumps(data),)]

    @classmethod
    def normalize(cls, endpoint: str, data: dict) -> tuple[list[str], list[tuple]]:
        """
        Normalize DHIS2 API response based on endpoint type

        Args:
            endpoint: DHIS2 API endpoint name
            data: Raw JSON response from DHIS2

        Returns:
            Tuple of (column_names, rows)
        """
        if endpoint == "analytics":
            return cls.normalize_analytics(data)
        elif endpoint == "dataValueSets":
            return cls.normalize_data_value_sets(data)
        elif endpoint == "events":
            return cls.normalize_events(data)
        elif endpoint == "trackedEntityInstances":
            return cls.normalize_tracked_entity_instances(data)
        elif endpoint in ["dataElements", "dataSets", "indicators", "organisationUnits",
                          "programs", "programStages", "programIndicators"]:
            return cls.normalize_metadata_list(data, endpoint)
        else:
            return cls.normalize_generic(data)


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
        """
        Return ONLY data query endpoints for DHIS2
        Excludes metadata endpoints (used by Query Builder) and configuration endpoints
        """
        # Data query endpoints - these return actual health/program data
        data_query_endpoints = [
            "analytics",              # Aggregated analytical data (MOST COMMON)
            "dataValueSets",          # Raw data entry values
            "events",                 # Tracker program events
            "trackedEntityInstances", # Tracked entities (people, assets)
            "enrollments",            # Program enrollments
        ]

        # These are always returned - no dynamic discovery needed for simplicity
        return data_query_endpoints

    def get_view_names(self, connection, schema=None, **kw):
        """Return list of view names (none for DHIS2)"""
        return []

    def has_table(self, connection, table_name, schema=None, **kw):
        """Check if table/endpoint exists in DHIS2"""
        # Get all available tables
        available_tables = self.get_table_names(connection, schema, **kw)
        return table_name in available_tables

    def get_columns(self, connection, table_name, schema=None, **kw):
        """
        Return column information dynamically from stored metadata or DHIS2 API
        For datasets, fetches actual dataElements from the dataset
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

        # For dataset tables, try to fetch actual dataElements from DHIS2
        # Dataset table names are typically cleaned display names
        try:
            # Try to fetch dataElements for this dataset from DHIS2
            from sqlalchemy.engine.url import make_url
            url = make_url(str(connection.url))

            base_url = f"https://{url.host}{url.database or '/api'}"
            auth = (url.username, url.password) if url.username else None

            # Search for dataset by name
            response = requests.get(
                f"{base_url}/dataSets",
                params={
                    "filter": f"displayName:ilike:{table_name.replace('_', ' ')}",
                    "fields": "id,displayName,dataSetElements[dataElement[id,displayName,valueType]]",
                    "paging": "false"
                },
                auth=auth,
                timeout=5,
            )

            if response.status_code == 200:
                datasets = response.json().get("dataSets", [])
                if datasets:
                    dataset = datasets[0]
                    columns = [
                        {"name": "period", "type": types.String(), "nullable": True},
                        {"name": "orgUnit", "type": types.String(), "nullable": True},
                    ]

                    # Add columns for each dataElement
                    for dse in dataset.get("dataSetElements", []):
                        de = dse.get("dataElement", {})
                        col_name = de.get("displayName", de.get("id", "")).replace(" ", "_").lower()
                        columns.append({
                            "name": col_name,
                            "type": types.String(),
                            "nullable": True
                        })

                    logger.info(f"Discovered {len(columns)} columns for dataset {table_name}")
                    return columns
        except Exception as e:
            logger.debug(f"Could not fetch dataElements for {table_name}: {e}")

        # Fallback: generic columns
        return [
            {"name": "id", "type": types.String(), "nullable": True},
            {"name": "period", "type": types.String(), "nullable": True},
            {"name": "orgUnit", "type": types.String(), "nullable": True},
            {"name": "value", "type": types.String(), "nullable": True},
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
            endpoint = match.group(1)
            # Don't use schema name as endpoint
            if endpoint.lower() == 'dhis2':
                logger.warning("Ignoring 'dhis2' as endpoint - using default 'analytics'")
                return "analytics"
            return endpoint
        return "analytics"  # Default fallback

    def _extract_query_params(self, query: str) -> dict[str, str]:
        """
        Extract query parameters from SQL WHERE clause or comments OR cached params
        Supports:
        - Application cache (persists across requests)
        - Flask g.dhis2_dataset_params (same-request access)
        - WHERE field='value' AND field2='value2'
        - -- DHIS2: param1=value1, param2=value2
        - /* DHIS2: param1=value1&param2=value2 */
        """
        from urllib.parse import unquote
        from flask import g

        params = {}
        from_match = re.search(r'FROM\s+(\w+)', query, re.IGNORECASE)
        table_name = from_match.group(1) if from_match else "analytics"

        # FIRST: Check application cache (persists across requests)
        cache_param_str = None
        try:
            from superset.extensions import cache_manager
            # Try to find cached params by table name (we cache with dataset ID pattern)
            # Search for any cache key matching this table
            cache_keys = [f"dhis2_params_{i}_{table_name}" for i in range(1, 200)]  # Check dataset IDs 1-200
            for cache_key in cache_keys:
                cached = cache_manager.data_cache.get(cache_key)
                if cached:
                    cache_param_str = cached
                    print(f"[DHIS2] Found params in cache for {table_name}: {cache_param_str[:100]}")
                    logger.info(f"Using cached parameters for table: {table_name}")
                    break
        except Exception as e:
            logger.warning(f"[DHIS2] Could not check cache: {e}")

        if cache_param_str:
            separator = '&' if '&' in cache_param_str else ','
            for param in cache_param_str.split(separator):
                if '=' in param:
                    key, value = param.split('=', 1)
                    key, value = key.strip(), value.strip()
                    if key == 'dimension':
                        params[key] = f"{params[key]};{value}" if key in params else value
                    else:
                        params[key] = value
            if params:
                return params

        # SECOND: Check Flask g context for parameters (same-request access)
        if hasattr(g, 'dhis2_dataset_params'):
            if table_name in g.dhis2_dataset_params:
                param_str = g.dhis2_dataset_params[table_name]
                print(f"[DHIS2] Found params in Flask g for {table_name}: {param_str[:100]}")
                logger.info(f"Using stored parameters from Flask g for table: {table_name}")
                separator = '&' if '&' in param_str else ','
                for param in param_str.split(separator):
                    if '=' in param:
                        key, value = param.split('=', 1)
                        key, value = key.strip(), value.strip()
                        if key == 'dimension':
                            params[key] = f"{params[key]};{value}" if key in params else value
                        else:
                            params[key] = value
                if params:
                    return params

        # SECOND: Extract from SQL block comments (/* DHIS2: key=value&key2=value2 */)
        block_comment_match = re.search(r'/\*\s*DHIS2:\s*(.+?)\s*\*/', query, re.IGNORECASE | re.DOTALL)
        if block_comment_match:
            param_str = block_comment_match.group(1).strip()
            # URL decode the parameter string first
            param_str = unquote(param_str)
            # Split by & or , to support both URL format and comma-separated
            separator = '&' if '&' in param_str else ','
            for param in param_str.split(separator):
                if '=' in param:
                    key, value = param.split('=', 1)
                    key = key.strip()
                    value = value.strip()

                    # Handle dimension parameter specially - can appear multiple times
                    if key == 'dimension':
                        if key in params:
                            # Append to existing dimension with semicolon separator for _make_api_request
                            params[key] = f"{params[key]};{value}"
                        else:
                            params[key] = value
                    else:
                        params[key] = value

        # Extract from SQL line comments (-- DHIS2: key=value, key2=value2)
        # Support both comma and ampersand separators (URL format)
        comment_match = re.search(r'--\s*DHIS2:\s*(.+?)(?:\n|$)', query, re.IGNORECASE)
        if comment_match:
            param_str = comment_match.group(1)
            # URL decode the parameter string first
            param_str = unquote(param_str)
            # Split by & or , to support both URL format and comma-separated
            separator = '&' if '&' in param_str else ','
            for param in param_str.split(separator):
                if '=' in param:
                    key, value = param.split('=', 1)
                    key = key.strip()
                    value = value.strip()

                    # Handle dimension parameter specially - can appear multiple times
                    if key == 'dimension':
                        if key in params:
                            # Append to existing dimension with semicolon separator for _make_api_request
                            params[key] = f"{params[key]};{value}"
                        else:
                            params[key] = value
                    else:
                        params[key] = value

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
        Adds sensible DHIS2 defaults for common endpoints
        """
        merged = {}

        # Layer 0: DHIS2 smart defaults based on endpoint
        # Only add defaults if not overridden by query params
        if endpoint == "analytics":
            # Check if query has explicit period dimension (pe:)
            has_period_dimension = False
            if "dimension" in query_params:
                dimensions = query_params["dimension"].split(";")
                has_period_dimension = any(d.startswith("pe:") for d in dimensions)

            # Only add startDate/endDate if no explicit period dimension
            if not has_period_dimension:
                from datetime import datetime, timedelta
                end_date = datetime.now()
                start_date = end_date - timedelta(days=365)  # Last year

                merged.update({
                    "startDate": start_date.strftime("%Y-%m-%d"),
                    "endDate": end_date.strftime("%Y-%m-%d"),
                })

            # Always add these defaults
            merged.update({
                "skipMeta": "false",
                "displayProperty": "NAME",
            })

        elif endpoint == "dataValueSets":
            # Default dataValueSets parameters
            from datetime import datetime, timedelta
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365)

            merged.update({
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
            })

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

        # Handle dimension parameter specially - DHIS2 requires multiple dimension parameters
        # Format: dimension=dx:id1;id2;id3;pe:LAST_YEAR;ou:OrgUnit
        # Split into: dimension=dx:id1;id2;id3&dimension=pe:LAST_YEAR&dimension=ou:OrgUnit
        query_params = []
        for key, value in params.items():
            if key == "dimension" and ";" in value:
                # Split on dimension prefixes (dx:, pe:, ou:), not all semicolons
                # Use regex to split only before dimension prefixes
                import re
                # Split before dx:, pe:, ou: while keeping the prefix with the value
                dimension_parts = re.split(r';(?=(?:dx|pe|ou):)', value)
                for dim in dimension_parts:
                    if dim:  # Skip empty strings
                        query_params.append(f"dimension={dim}")
            else:
                query_params.append(f"{key}={value}")

        # Build URL with properly formatted parameters
        if query_params:
            url = f"{url}?{'&'.join(query_params)}"

        print(f"[DHIS2] API request URL: {url}")
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
        Parse DHIS2 API response using endpoint-aware normalizers
        """
        print(f"[DHIS2] Parsing response for endpoint: {endpoint}")
        print(f"[DHIS2] Response keys: {list(data.keys())}")
        print(f"[DHIS2] Response sample: {str(data)[:500]}")

        # Use the normalizer to parse response
        col_names, rows = DHIS2ResponseNormalizer.normalize(endpoint, data)

        print(f"[DHIS2] Normalized columns: {col_names}")
        print(f"[DHIS2] Normalized row count: {len(rows)}")
        if rows:
            print(f"[DHIS2] First row: {rows[0]}")

        # Set cursor description
        self._set_description(col_names)

        logger.info(f"Normalized {len(rows)} rows with {len(col_names)} columns for endpoint {endpoint}")
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
        print(f"[DHIS2] Executing query: {query}")
        logger.info(f"Executing DHIS2 query: {query}")

        # Parse query to get endpoint and parameters
        endpoint = self._parse_endpoint_from_query(query)
        print(f"[DHIS2] Parsed endpoint: {endpoint}")
        logger.info(f"Parsed endpoint: {endpoint}")

        query_params = self._extract_query_params(query)
        print(f"[DHIS2] Query params: {query_params}")
        logger.info(f"Query params: {query_params}")

        # Merge all parameter sources
        api_params = self._merge_params(endpoint, query_params)
        print(f"[DHIS2] Merged params: {api_params}")
        logger.info(f"Merged params: {api_params}")

        # Execute API request
        self._rows = self._make_api_request(endpoint, api_params)
        self.rowcount = len(self._rows)
        print(f"[DHIS2] Fetched {self.rowcount} rows")

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
