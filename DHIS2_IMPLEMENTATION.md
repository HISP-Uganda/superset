# DHIS2 Integration - Complete Implementation Guide

## Overview
Real-time DHIS2 integration for Uganda Malaria Data Repository using Apache Superset. No data storage/sync - queries DHIS2 API on-demand.

## Implementation Status

### ✅ Completed
1. **DHIS2 Database Engine Spec** - Created `superset/db_engine_specs/dhis2.py`
2. **DHIS2 SQLAlchemy Dialect** - Created `superset/db_engine_specs/dhis2_dialect.py`
3. **Runtime Dialect Registration** - Registered with SQLAlchemy at import time
4. **Connection Testing** - Test connection works via DHIS2 `/api/me` endpoint
5. **Schema Introspection** - DHIS2 endpoints exposed as virtual tables
6. **Driver Registration** - Added to `get_available_engine_specs()`

### 🚧 In Progress
1. **Dataset Creation** - Making DHIS2 tables visible in UI
2. **Query Execution** - Need to implement DHIS2 API calls in cursor.execute()

### ⏭️ Pending
1. **Visual Query Builder** - Custom UI for DHIS2 queries (not SQL)
2. **Analytics API Implementation** - Aggregated indicator data
3. **DataValueSets API Implementation** - Raw facility-level data
4. **Tracker/Events API Implementation** - Individual-level data
5. **Error Handling** - User-friendly error messages
6. **Documentation** - User guide for DHIS2 datasets

## Files Created/Modified

### Core Implementation Files

**1. superset/db_engine_specs/dhis2.py**
- Engine spec for DHIS2 connections
- Connection URI format: `dhis2://username:password@server.dhis2.org/api`
- Test connection via `/api/me` endpoint
- Schema and table introspection methods

**2. superset/db_engine_specs/dhis2_dialect.py**
- SQLAlchemy dialect for DHIS2
- Fake DBAPI implementation (DHIS2DBAPI, DHIS2Connection, DHIS2Cursor)
- Schema introspection methods (get_schema_names, get_table_names, get_columns)
- Three virtual tables: analytics, dataValueSets, trackedEntityInstances

**3. superset/db_engine_specs/__init__.py**
- Modified `get_available_engine_specs()` to support class-level drivers
- Lines 193-196: Check for `drivers` attribute when no installed SQLAlchemy drivers exist

**4. setup.py**
- Line 68: Added DHIS2 dialect entry point (not working in editable mode)
- Workaround: Runtime registration in dhis2.py using `registry.register()`

## Connection Details

### Test Server (Working)
```
dhis2://admin:district@play.im.dhis2.org/stable-2-42-2/api
```

### Uganda HMIS Test Server
```
dhis2://username:password@tests.dhis2.hispuganda.org/hmis/api
```

**Note**: URL-encode special characters in passwords:
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`

Example: Password `admin@2025` becomes `admin%402025`

## Virtual Tables (DHIS2 API Endpoints)

### 1. analytics
Aggregated indicator data from DHIS2 Analytics API

**Columns**:
- `dx` - Data dimension (data element/indicator ID)
- `pe` - Period dimension (date/period)
- `ou` - Organization unit dimension (facility/district)
- `value` - Numeric value

**Example DHIS2 API**:
```
GET /api/analytics?dimension=dx:dataElementId&dimension=pe:202501&dimension=ou:orgUnitId
```

### 2. dataValueSets
Raw facility-level data values

**Columns**:
- `dataElement` - Data element ID
- `period` - Reporting period
- `orgUnit` - Organization unit ID
- `value` - Data value

**Example DHIS2 API**:
```
GET /api/dataValueSets?dataSet=dataSetId&period=202501&orgUnit=orgUnitId
```

### 3. trackedEntityInstances
Individual-level/case-based data (tracker programs)

**Columns**:
- `trackedEntityInstance` - Unique instance ID
- `orgUnit` - Registration organization unit
- `attributes` - Tracked entity attributes (JSON)

**Example DHIS2 API**:
```
GET /api/trackedEntityInstances?ou=orgUnitId&program=programId
```

## Technical Architecture

### How It Works

1. **User adds DHIS2 database connection**
   - Enter URI: `dhis2://username:password@server/api`
   - Click "Test Connection"
   - Superset calls `DHIS2EngineSpec.test_connection()`
   - Makes HTTP GET to `https://server/api/me` to verify credentials

2. **User creates dataset**
   - Go to Data → Datasets → + DATASET
   - Select DHIS2 database
   - Schema: `dhis2`
   - Table: `analytics`, `dataValueSets`, or `trackedEntityInstances`
   - Superset calls `DHIS2Dialect.get_columns()` to get column info

3. **User creates chart (future)**
   - Select dataset
   - Build visualization
   - Superset generates query
   - `DHIS2Cursor.execute()` translates to DHIS2 API call
   - Fetch data from DHIS2 API
   - Return as rows to Superset

### Query Translation (To Be Implemented)

Superset will generate SQL like:
```sql
SELECT dx, pe, ou, value
FROM analytics
WHERE pe = '202501' AND ou = 'Uganda'
```

This needs to be translated to DHIS2 API call:
```
GET /api/analytics?dimension=dx&dimension=pe:202501&dimension=ou:Uganda
```

## Key Technical Fixes

### Issue 1: DHIS2 Not Appearing in Available Databases
**Problem**: `get_available_engine_specs()` only checked installed SQLAlchemy dialects

**Solution**: Modified `superset/db_engine_specs/__init__.py` lines 193-196:
```python
# If no installed drivers found, check if engine spec has class-level drivers attribute
# This allows custom/API-based engines like DHIS2 that don't have SQLAlchemy dialects
if not driver and hasattr(engine_spec, "drivers") and engine_spec.drivers:
    driver = set(engine_spec.drivers.keys())
```

### Issue 2: "Could not load database driver"
**Problem**: SQLAlchemy couldn't find dhis2 dialect via entry points

**Solution**: Runtime dialect registration in `dhis2.py`:
```python
from sqlalchemy.dialects import registry
registry.register("dhis2", "superset.db_engine_specs.dhis2_dialect", "DHIS2Dialect")
```

### Issue 3: get_extra_params() Signature Mismatch
**Problem**: Base class expects `source` parameter

**Solution**: Updated method signature:
```python
def get_extra_params(cls, database: Database, source=None) -> Dict[str, Any]:
```

### Issue 4: Table Loading Error
**Problem**: DHIS2 dialect missing schema introspection methods

**Solution**: Added to `DHIS2Dialect`:
- `get_schema_names()` - Returns `["dhis2"]`
- `get_table_names()` - Returns list of virtual tables
- `get_columns()` - Returns column definitions for each table
- `has_table()` - Checks if table exists
- `get_pk_constraint()`, `get_foreign_keys()`, `get_indexes()` - Return empty

## Next Steps

### Immediate (Add Dataset)
1. Verify tables appear in UI: Data → Datasets → + DATASET
2. Select `analytics` table
3. Click "CREATE DATASET AND CREATE CHART"

### Short-term (Query Execution)
1. Implement `DHIS2Cursor.execute()` to call DHIS2 API
2. Parse WHERE clauses to extract DHIS2 query parameters
3. Fetch data from DHIS2 and return as rows
4. Handle pagination for large result sets

### Medium-term (Visual Query Builder)
1. Create custom UI component for DHIS2 queries
2. Dropdown selectors for:
   - Data elements/indicators
   - Periods
   - Organization units
3. Generate DHIS2 API calls from UI selections

### Long-term (Advanced Features)
1. Metadata caching (org units, data elements)
2. Query optimization
3. Batch requests for multiple data elements
4. Support for DHIS2 filters and analytics dimensions
5. Integration with DHIS2 favorites/saved analytics

## Testing

### Test DHIS2 Play Server Connection
```bash
curl -u "admin:district" "https://play.im.dhis2.org/stable-2-42-2/api/me"
```

### Test SQLAlchemy Engine Creation
```python
from superset.db_engine_specs.dhis2 import DHIS2EngineSpec
from sqlalchemy import create_engine

engine = create_engine('dhis2://admin:district@play.im.dhis2.org/stable-2-42-2/api')
print(engine.dialect.name)  # Should print: dhis2
```

### Test Table Listing
```python
from sqlalchemy import create_engine, inspect

engine = create_engine('dhis2://admin:district@play.im.dhis2.org/stable-2-42-2/api')
inspector = inspect(engine)
print(inspector.get_schema_names())  # ['dhis2']
print(inspector.get_table_names(schema='dhis2'))  # ['analytics', 'dataValueSets', 'trackedEntityInstances']
```

## Resources

- **DHIS2 API Documentation**: https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/analytics.html
- **Uganda HMIS**: https://tests.dhis2.hispuganda.org/hmis/
- **DHIS2 Play Server**: https://play.im.dhis2.org/
- **Superset Engine Specs**: https://github.com/apache/superset/tree/master/superset/db_engine_specs

## Date
Last Updated: 2025-10-31
