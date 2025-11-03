# DHIS2 Integration Guide for Apache Superset

## Overview

This integration enables Apache Superset to connect to DHIS2 instances via their REST API with **fully dynamic parameter support**. No hardcoded endpoints or parameters - everything is configurable!

## Features

✅ **Multiple Authentication Methods**: Basic Auth and Personal Access Token (PAT)
✅ **Dynamic Endpoint Configuration**: Define any DHIS2 API endpoint as a "table"
✅ **Flexible Parameter System**: 3-layer parameter precedence (global → endpoint-specific → query-time)
✅ **Auto Column Detection**: Dynamically discovers columns from API responses
✅ **DHIS2-Native Parameters**: Use `USER_ORGUNIT`, `LAST_YEAR`, dimension syntax, etc.

## Connection Setup

### 1. Basic Authentication

```json
{
  "server": "dhis2.hispuganda.org",
  "api_path": "/hmis/api",
  "auth_method": "basic",
  "username": "admin",
  "password": "district"
}
```

### 2. Personal Access Token (PAT)

```json
{
  "server": "play.dhis2.org/40.2.2",
  "api_path": "/api",
  "auth_method": "pat",
  "access_token": "d2pat_xxxxxxxxxxxxxxxxxxxxx"
}
```

### 3. With Global Default Parameters

```json
{
  "server": "dhis2.hispuganda.org",
  "api_path": "/hmis/api",
  "auth_method": "basic",
  "username": "admin",
  "password": "district",
  "default_params": {
    "displayProperty": "NAME",
    "orgUnit": "USER_ORGUNIT",
    "period": "LAST_YEAR"
  }
}
```

## Endpoint Configuration

### Adding Endpoint-Specific Parameters

Store this in the database connection's "Extra" field (JSON):

```json
{
  "endpoint_params": {
    "analytics": {
      "dimension": "dx:fbfJHSPpUQD;dx:cYeuwXTCPkU;pe:LAST_12_MONTHS;ou:LEVEL-2",
      "skipMeta": "false",
      "displayProperty": "NAME"
    },
    "dataValueSets": {
      "dataSet": "rmaYTmNPkVA",
      "period": "202508",
      "orgUnit": "FvewOonC8lS",
      "includeDeleted": "false"
    },
    "trackedEntityInstances": {
      "ou": "USER_ORGUNIT",
      "program": "IpHINAT79UW",
      "skipPaging": "false"
    },
    "events": {
      "program": "IpHINAT79UW",
      "orgUnit": "USER_ORGUNIT",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31"
    }
  },
  "timeout": 60,
  "page_size": 100
}
```

## Usage Examples

### Example 1: Analytics with Default Parameters

**SQL Query:**
```sql
SELECT * FROM analytics
```

**Actual API Call:**
```
GET /api/analytics?dimension=dx:fbfJHSPpUQD;dx:cYeuwXTCPkU;pe:LAST_12_MONTHS;ou:LEVEL-2&skipMeta=false&displayProperty=NAME
```

### Example 2: DataValueSets with Query-Time Override

**SQL Query:**
```sql
SELECT * FROM dataValueSets WHERE period = '202509'
```

**Actual API Call:**
```
GET /api/dataValueSets?dataSet=rmaYTmNPkVA&orgUnit=FvewOonC8lS&period=202509&includeDeleted=false
```
*(period overridden from '202508' to '202509')*

### Example 3: Using SQL Comments for Complex Parameters

**SQL Query:**
```sql
-- DHIS2: dimension=dx:MALARIA_CASES;pe:LAST_YEAR;ou:LEVEL-3, hierarchyMeta=true
SELECT * FROM analytics
```

**Actual API Call:**
```
GET /api/analytics?dimension=dx:MALARIA_CASES;pe:LAST_YEAR;ou:LEVEL-3&hierarchyMeta=true&displayProperty=NAME
```

### Example 4: Custom Endpoint (Events)

**SQL Query:**
```sql
SELECT * FROM events WHERE startDate = '2024-06-01' AND endDate = '2024-06-30'
```

**Actual API Call:**
```
GET /api/events?program=IpHINAT79UW&orgUnit=USER_ORGUNIT&startDate=2024-06-01&endDate=2024-06-30
```

### Example 5: Tracked Entity Instances

**SQL Query:**
```sql
SELECT * FROM trackedEntityInstances
```

**Actual API Call:**
```
GET /api/trackedEntityInstances?ou=USER_ORGUNIT&program=IpHINAT79UW&skipPaging=false
```

## Parameter Precedence

Parameters are merged with the following priority (highest wins):

```
Query-Time Parameters (WHERE clause or comments)
    ↓ overrides
Endpoint-Specific Parameters (endpoint_params)
    ↓ overrides
Global Default Parameters (default_params)
```

**Example:**

Connection config:
```json
{
  "default_params": {"displayProperty": "NAME", "period": "LAST_YEAR"},
  "endpoint_params": {
    "analytics": {"period": "LAST_12_MONTHS", "skipMeta": "false"}
  }
}
```

Query:
```sql
SELECT * FROM analytics WHERE period = '202508'
```

Final parameters:
```
displayProperty = "NAME"       (from default_params)
skipMeta = "false"             (from endpoint_params)
period = "202508"              (from query - highest priority)
```

## Dynamic Endpoints

The integration automatically discovers endpoints configured in `endpoint_params`. If no configuration exists, it defaults to common DHIS2 endpoints:

- `analytics`
- `dataValueSets`
- `trackedEntityInstances`
- `events`
- `enrollments`
- `programIndicators`
- `dataElements`
- `organisationUnits`

**To add custom endpoints**, simply add them to `endpoint_params`:

```json
{
  "endpoint_params": {
    "myCustomReport": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}
```

Then query:
```sql
SELECT * FROM myCustomReport
```

## Dynamic Column Detection

Columns are automatically detected from API responses:

### Analytics Response
```json
{
  "headers": [
    {"name": "dx", "column": "Data"},
    {"name": "pe", "column": "Period"},
    {"name": "ou", "column": "Organisation unit"},
    {"name": "value", "column": "Value"}
  ],
  "rows": [
    ["fbfJHSPpUQD", "202401", "FvewOonC8lS", "1234"]
  ]
}
```
→ Columns: `dx`, `pe`, `ou`, `value`

### DataValueSets Response
```json
{
  "dataValues": [
    {
      "dataElement": "fbfJHSPpUQD",
      "period": "202401",
      "orgUnit": "FvewOonC8lS",
      "value": "1234",
      "storedBy": "admin",
      "created": "2024-01-15"
    }
  ]
}
```
→ Columns: `dataElement`, `period`, `orgUnit`, `value`, `storedBy`, `created`

## DHIS2-Specific Parameters

The integration supports all DHIS2 API parameters:

### Analytics
- `dimension`: Data dimensions (e.g., `dx:UID1;dx:UID2;pe:LAST_YEAR;ou:USER_ORGUNIT`)
- `filter`: Filters
- `displayProperty`: `NAME`, `SHORTNAME`, `CODE`
- `skipMeta`: `true`, `false`
- `hierarchyMeta`: `true`, `false`

### DataValueSets
- `dataSet`: Dataset UID
- `period`: Period (ISO format or relative like `LAST_YEAR`)
- `orgUnit`: Org unit UID or `USER_ORGUNIT`
- `includeDeleted`: `true`, `false`
- `children`: `true`, `false`

### Tracked Entity Instances
- `ou`: Org unit UID or `USER_ORGUNIT`
- `program`: Program UID
- `trackedEntityType`: Tracked entity type UID
- `skipPaging`: `true`, `false`
- `page`: Page number
- `pageSize`: Page size

### Events
- `program`: Program UID
- `orgUnit`: Org unit UID or `USER_ORGUNIT`
- `startDate`: Start date (YYYY-MM-DD)
- `endDate`: End date (YYYY-MM-DD)
- `status`: `ACTIVE`, `COMPLETED`, `CANCELLED`

## Best Practices

### 1. Use Sensible Defaults
Set common parameters at the global level:
```json
{
  "default_params": {
    "displayProperty": "NAME",
    "orgUnit": "USER_ORGUNIT"
  }
}
```

### 2. Configure Reusable Endpoints
Define frequently-used API calls in `endpoint_params`:
```json
{
  "endpoint_params": {
    "malaria_monthly": {
      "dimension": "dx:MALARIA_CASES;dx:MALARIA_DEATHS;pe:LAST_12_MONTHS;ou:LEVEL-3",
      "skipMeta": "false"
    }
  }
}
```

### 3. Override When Needed
Use WHERE clauses for dynamic queries:
```sql
SELECT * FROM malaria_monthly WHERE period = 'THIS_MONTH'
```

### 4. Use Relative Periods
DHIS2 relative periods like `LAST_YEAR`, `LAST_12_MONTHS`, `THIS_MONTH` make dashboards dynamic

### 5. Leverage USER_ORGUNIT
Use `USER_ORGUNIT` to automatically scope data to the logged-in user's organization

## Troubleshooting

### Connection Test Fails
- Check server hostname (no `https://` prefix)
- Verify API path (usually `/api` or `/instance/api`)
- Test credentials in DHIS2 directly
- For PAT, ensure token has `ApiToken ` prefix in header

### No Data Returned
- Check API call in logs: `DHIS2 API request: https://...`
- Verify parameters are valid DHIS2 UIDs
- Test API endpoint directly in browser or Postman
- Check DHIS2 user permissions

### Column Mismatch
- API response structure may vary by DHIS2 version
- Check actual response format in logs
- Adjust endpoint configuration if needed

## Advanced Configuration

### Full Example

```json
{
  "server": "dhis2.hispuganda.org",
  "api_path": "/hmis/api",
  "auth_method": "basic",
  "username": "analytics_user",
  "password": "secure_password",

  "default_params": {
    "displayProperty": "NAME",
    "orgUnit": "USER_ORGUNIT"
  },

  "endpoint_params": {
    "analytics": {
      "dimension": "pe:LAST_12_MONTHS",
      "skipMeta": "false"
    },
    "malaria_data": {
      "dimension": "dx:MALARIA_CONFIRMED_CASES;dx:MALARIA_DEATHS;pe:LAST_YEAR;ou:LEVEL-3",
      "skipMeta": "false",
      "hierarchyMeta": "true"
    },
    "immunization_data": {
      "dimension": "dx:BCG_DOSES;dx:OPV_DOSES;pe:THIS_YEAR;ou:USER_ORGUNIT",
      "skipMeta": "false"
    }
  },

  "timeout": 90,
  "page_size": 100
}
```

## Support

For issues or questions:
- DHIS2 API Documentation: https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/analytics.html
- Superset Documentation: https://superset.apache.org/docs/
- GitHub Issues: https://github.com/apache/superset/issues
