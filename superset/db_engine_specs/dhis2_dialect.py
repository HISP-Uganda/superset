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
Minimal dialect to enable DHIS2 database connections
"""
from __future__ import annotations

from typing import Any, Optional
from sqlalchemy.engine import default
from sqlalchemy import pool


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
        """Return column information for a table"""
        from sqlalchemy import types

        # Return basic columns based on DHIS2 API endpoint
        if table_name == "analytics":
            return [
                {"name": "dx", "type": types.String(), "nullable": True},
                {"name": "pe", "type": types.String(), "nullable": True},
                {"name": "ou", "type": types.String(), "nullable": True},
                {"name": "value", "type": types.Numeric(), "nullable": True},
            ]
        elif table_name == "dataValueSets":
            return [
                {"name": "dataElement", "type": types.String(), "nullable": True},
                {"name": "period", "type": types.String(), "nullable": True},
                {"name": "orgUnit", "type": types.String(), "nullable": True},
                {"name": "value", "type": types.String(), "nullable": True},
            ]
        elif table_name == "trackedEntityInstances":
            return [
                {"name": "trackedEntityInstance", "type": types.String(), "nullable": True},
                {"name": "orgUnit", "type": types.String(), "nullable": True},
                {"name": "attributes", "type": types.String(), "nullable": True},
            ]
        return []

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
    """Fake connection object for DHIS2"""

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def cursor(self):
        """Return a fake cursor"""
        return DHIS2Cursor(self)

    def commit(self):
        """No-op commit"""
        pass

    def rollback(self):
        """No-op rollback"""
        pass

    def close(self):
        """No-op close"""
        pass


class DHIS2Cursor:
    """Fake cursor object for DHIS2"""

    def __init__(self, connection):
        self.connection = connection
        self.description = None
        self.rowcount = -1
        self._rows = []

    def execute(self, query, parameters=None):
        """Execute a query (no-op for now)"""
        # This will be implemented later when we add query support
        pass

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
        """No-op close"""
        pass

    @property
    def description(self):
        """Return column descriptions"""
        return self._description

    @description.setter
    def description(self, value):
        """Set column descriptions"""
        self._description = value
