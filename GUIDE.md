# Uganda Malaria Superset - Customization Guide

**Project**: Customized Apache Superset for Uganda Malaria Data Repository
**Organization**: Ministry of Health, Uganda
**Last Updated**: October 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Key Customizations](#key-customizations)
3. [Differences from Vanilla Superset](#differences-from-vanilla-superset)
4. [Local Development Setup (Non-Docker)](#local-development-setup-non-docker)
5. [Data Source Connections](#data-source-connections)
6. [Database Configuration](#database-configuration)
7. [Deployment Guide](#deployment-guide)
8. [Malaria Cascade Feature](#malaria-cascade-feature)

---

## Overview

This is a customized Apache Superset instance tailored for the Uganda Malaria Data Repository. It includes custom home page, malaria-specific visualizations, and enhanced data source connectivity.

### Key Goals
- ✅ Custom home page with dashboard previews
- ✅ Malaria cascade chart visualization
- 🔄 Multiple data source support (APIs, Google Sheets, Excel, PostgreSQL)
- 🔄 Local non-Docker deployment matching production
- 🔄 Writable database for data imports

---

## Key Customizations

### 1. Enhanced Home Page
**Location**: `superset-frontend/src/pages/Home/EnhancedHome.tsx`

**Features**:
- Dashboard sidebar with all available dashboards
- Live chart previews (5 charts per dashboard tab)
- Dynamic tab extraction from dashboard `position_json`
- "View Full Dashboard" button
- Responsive design

**Components**:
- `EnhancedHome.tsx` - Main home page container
- `DataSourceSidebar.tsx` - Left sidebar with dashboard list
- `DashboardContentArea.tsx` - Main content area with tabs and chart previews
- `Menu.tsx` - Top navigation with Home tab

**Backend Changes**:
- `superset/initialization/__init__.py` - Added "Home" menu item visible to all users

**Routes**:
- URL: `/superset/welcome/`
- Route configuration in `superset-frontend/src/views/routes.tsx`

### 2. Malaria Cascade Visualization
**Status**: In Progress

**Data Structure**:
```sql
Table: malaria_cascade
- month_date: Date of data collection
- stage: Cascade stage (Suspected → Tested → Confirmed → Treated → Total Treated)
- stage_order: Numeric order for sorting (1-5)
- count: Number of cases
- percentage: Percentage of initial suspected cases
- data_source: MOH Uganda
```

**MOH Uganda Data Format**:
```
105-EP01a. Suspected Malaria (fever)
105-EP01b. Malaria Tested (B/s & RDT)
105-EP01c. Malaria confirmed (B/s & RDT)
105-EP01d. Confirmed Malaria cases treated
105-EP01e Total malaria cases treated
```

---

## Differences from Vanilla Superset

| Feature | Vanilla Superset | Custom Superset |
|---------|-----------------|-----------------|
| **Home Page** | Welcome page with quick actions | Dashboard preview with live charts |
| **Navigation** | Standard menu | Home tab with dashboard-centric UI |
| **Dashboard Access** | Click through menus | Sidebar with one-click access |
| **Chart Preview** | Thumbnail only | Live embedded charts (5 per tab) |
| **Tab Display** | Dashboard view only | Extracted and shown on home page |
| **Data Sources** | Database-only | APIs, Google Sheets, Excel, PostgreSQL |
| **Deployment** | Docker-focused | Native installation (matching server) |

---

## Local Development Setup (Non-Docker)

### Current Setup (Docker-based)
```bash
# Current approach - uses Docker
docker-compose up
```

### Target Setup (Native - Matching Production Server)

#### Prerequisites
```bash
# macOS
brew install python@3.10 node@20 postgresql

# Ubuntu (matching server)
sudo apt-get update
sudo apt-get install python3.10 python3.10-venv postgresql nodejs npm
```

#### Step 1: Python Virtual Environment
```bash
cd /path/to/malaria-superset

# Create virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements/development.txt
pip install -e .
```

#### Step 2: Database Setup (PostgreSQL)
```bash
# Create PostgreSQL database
createdb superset_malaria

# Configure Superset to use PostgreSQL
export SUPERSET_CONFIG_PATH=/path/to/malaria-superset/superset_config.py
```

**superset_config.py**:
```python
# PostgreSQL Database
SQLALCHEMY_DATABASE_URI = 'postgresql://localhost/superset_malaria'

# Disable example data
SUPERSET_LOAD_EXAMPLES = False

# Enable data upload
CSV_TO_DATABASE_UPLOAD_CONFIG = {
    'ALLOWED_EXTENSIONS': ['csv', 'xlsx', 'xls'],
    'CSV_ALLOWED_SQL_COMMENTS': True,
}

# Disable read-only mode for SQL Lab
PREVENT_UNSAFE_DB_CONNECTIONS = False
SQLLAB_FORCE_RUN_IN_MODE = False
```

#### Step 3: Initialize Superset
```bash
# Initialize database
superset db upgrade

# Create admin user
superset fab create-admin \
    --username admin \
    --firstname Admin \
    --lastname User \
    --email admin@moh.go.ug \
    --password admin

# Load roles and permissions
superset init
```

#### Step 4: Frontend Development
```bash
cd superset-frontend

# Install dependencies (Node 20.x required)
npm install --legacy-peer-deps

# Development mode (hot reload)
npm run dev

# Production build
npm run build
```

#### Step 5: Run Superset
```bash
# Terminal 1: Backend
source venv/bin/activate
superset run -p 8088 --with-threads --reload --debugger

# Terminal 2: Frontend (if using dev mode)
cd superset-frontend
npm run dev
```

Access at: http://localhost:8088

---

## Data Source Connections

### 1. PostgreSQL (Local & Remote)

**Install Driver**:
```bash
pip install psycopg2-binary
```

**Add Connection**:
- Go to: Data → Databases → + Database
- Select: PostgreSQL
- Connection String:
  ```
  postgresql://user:password@host:5432/database
  ```

**Local PostgreSQL**:
```
postgresql://localhost/malaria_data
```

**Remote PostgreSQL**:
```
postgresql://username:password@remote-server.com:5432/malaria_db
```

### 2. Google Sheets

**Install Plugin**:
```bash
pip install shillelagh[gsheetsapi]
```

**Setup**:
1. Create Google Service Account
2. Download credentials JSON
3. Share sheet with service account email

**Connection String**:
```
gsheets://
```

**Example**:
```python
# In superset_config.py
ALLOWED_EXTRA_DATABASES = ['gsheets']
```

### 3. Excel/CSV Upload

**Already Enabled** (see superset_config.py above)

**Usage**:
- Go to: Data → Upload a CSV
- Select file (.csv, .xlsx, .xls)
- Configure table name and settings
- Click "Save"

### 4. REST API Connections

**Option 1: Custom SQL Connector** (via Python script)
```python
# scripts/import_from_api.py
import requests
from superset import db
from sqlalchemy import Table, MetaData, create_engine

def fetch_api_data(api_url):
    response = requests.get(api_url)
    return response.json()

def load_to_table(data, table_name):
    # Insert into database table
    # Superset can then query this table
    pass
```

**Option 2: DHIS2 Integration** (Future)
```python
# Custom database engine spec for DHIS2
# See: superset/db_engine_specs/dhis2.py (to be created)
```

### 5. Spreadsheet Sync (Automated)

**Using Google Sheets + Scheduled Query**:
```python
# Celery beat task to sync Google Sheets data
from celery import task
from superset import db

@task
def sync_google_sheet():
    # Fetch from Google Sheets
    # Update local table
    # Refresh Superset cache
    pass
```

---

## Database Configuration

### Production Setup (Ubuntu Server)
```bash
# Server uses APT-installed Superset
/usr/local/lib/python3.10/dist-packages/superset/

# Database location
/var/lib/superset/superset.db  # or PostgreSQL

# Configuration
/etc/superset/superset_config.py
```

### Local Development (macOS/Linux)
```bash
# Virtual environment
/path/to/malaria-superset/venv/

# Database (PostgreSQL)
postgresql://localhost/superset_malaria

# Configuration
/path/to/malaria-superset/superset_config.py
```

### Switching from SQLite to PostgreSQL

**Why PostgreSQL?**
- ✅ Better performance
- ✅ Concurrent writes (SQLite is read-only in SQL Lab)
- ✅ Production-ready
- ✅ Matches server setup

**Migration Steps**:
```bash
# 1. Export data from SQLite
superset export-dashboards -f dashboards_backup.zip

# 2. Switch to PostgreSQL (update superset_config.py)
SQLALCHEMY_DATABASE_URI = 'postgresql://localhost/superset_malaria'

# 3. Initialize PostgreSQL database
superset db upgrade

# 4. Import data
superset import-dashboards -f dashboards_backup.zip
```

---

## Deployment Guide

### Building for Production

**Frontend Build**:
```bash
cd superset-frontend
npm ci --legacy-peer-deps
npm run build
```

**Output**: `superset/static/assets/`

### Deployment Package

**Files to Deploy**:
1. **Frontend Assets**: `superset/static/assets/*`
2. **Backend File**: `superset/initialization/__init__.py`
3. **Scripts**: `scripts/*.py` (for data imports)

**Using build-and-package.sh**:
```bash
cd scripts
./build-and-package.sh

# Creates: deployment-build/malaria-superset-update-TIMESTAMP.tar.gz
```

### Server Deployment

**APT Installation Path**:
```
/usr/local/lib/python3.10/dist-packages/superset/
```

**Update Steps**:
```bash
# 1. Extract package
tar -xzf malaria-superset-update-*.tar.gz
cd malaria-superset-update-*

# 2. Run deployment script (includes backup)
sudo ./deploy-on-server.sh

# 3. Restart service
sudo systemctl restart superset  # or gunicorn
```

**Rollback**:
```bash
# Backups stored in: /root/superset-backups/TIMESTAMP/

sudo systemctl stop superset
sudo rm -rf /usr/local/lib/python3.10/dist-packages/superset/static/assets/*
sudo cp -R /root/superset-backups/TIMESTAMP/assets/* /usr/local/lib/python3.10/dist-packages/superset/static/assets/
sudo cp /root/superset-backups/TIMESTAMP/initialization/__init__.py /usr/local/lib/python3.10/dist-packages/superset/initialization/
sudo systemctl start superset
```

---

## Malaria Cascade Feature

### Data Import Methods

**Recommended Approach**: Use CSV Upload feature in Superset UI

**Steps**:
1. Prepare CSV file with columns:
   ```
   month_date,stage,stage_order,count,percentage,data_source
   2025-07-01,Suspected,1,2375185,100.00,MOH Uganda
   2025-07-01,Tested,2,2021223,85.10,MOH Uganda
   2025-07-01,Confirmed,3,981372,41.31,MOH Uganda
   2025-07-01,Treated,4,972239,40.93,MOH Uganda
   2025-07-01,Total Treated,5,931336,39.21,MOH Uganda
   ```

2. In Superset UI:
   - Go to: Data → Upload a CSV
   - Select your CSV file
   - Table name: `malaria_cascade`
   - Click "Save"

3. The table will be automatically registered as a dataset

### Creating Cascade Chart

1. **Register Dataset**:
   - Go to: Data → Datasets → + Dataset
   - Select database and `malaria_cascade` table

2. **Create Chart**:
   - Chart Type: Bar Chart (Vertical)
   - X-Axis: `stage`
   - Metric: `SUM(count)`
   - Sort: `stage_order ASC`

3. **Style as Waterfall**:
   - Color: Gradient from green to red
   - Show values on bars
   - Add reference line at 100%

### Data Update Process

**Monthly Data Updates**:
1. Prepare updated CSV with new month's data
2. Use SQL Lab or Upload CSV to append new records
3. Or use SQL Lab (if writable database configured):
   ```sql
   INSERT INTO malaria_cascade (month_date, stage, stage_order, count, percentage, data_source)
   VALUES
   ('2025-08-01', 'Suspected', 1, 2400000, 100.00, 'MOH Uganda'),
   ('2025-08-01', 'Tested', 2, 2050000, 85.42, 'MOH Uganda'),
   ('2025-08-01', 'Confirmed', 3, 1000000, 41.67, 'MOH Uganda'),
   ('2025-08-01', 'Treated', 4, 980000, 40.83, 'MOH Uganda'),
   ('2025-08-01', 'Total Treated', 5, 950000, 39.58, 'MOH Uganda');
   ```

---

## Next Steps

### Immediate (Local Setup)
- [ ] Set up Python virtual environment
- [ ] Install PostgreSQL and create database
- [ ] Configure `superset_config.py`
- [ ] Initialize Superset with PostgreSQL
- [ ] Import malaria cascade data
- [ ] Test enhanced home page locally

### Data Sources
- [ ] Connect to PostgreSQL (local)
- [ ] Set up Google Sheets integration
- [ ] Test Excel/CSV upload
- [ ] Document API connection pattern
- [ ] Plan DHIS2 integration

### Deployment
- [ ] Test build-and-package.sh locally
- [ ] Verify deployment on staging server
- [ ] Document server-specific configuration
- [ ] Create backup/restore procedures

---

## Troubleshooting

### Frontend Build Errors

**Issue**: Webpack errors about missing modules
```
ERROR: Module not found: 'react-ace'
ERROR: Module not found: '@deck.gl/widgets'
```

**Solution**: These are third-party dependency issues in base Superset
```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**Workaround**: If build still fails but assets are generated, proceed anyway. The errors are in unused code paths.

### Database Read-Only Issues

**Issue**: "This database does not allow for DDL/DML"

**Solution**: Switch from SQLite to PostgreSQL or update config:
```python
# superset_config.py
PREVENT_UNSAFE_DB_CONNECTIONS = False
SQLLAB_FORCE_RUN_IN_MODE = False
```

### Import Errors (werkzeug, dateutil)

**Issue**: Python dependencies not found

**Solution**: Activate virtual environment first:
```bash
source venv/bin/activate
pip install -r requirements/development.txt
```

---

## Resources

### Documentation
- [Apache Superset Docs](https://superset.apache.org/docs/intro)
- [Superset API Reference](https://superset.apache.org/docs/api)
- [Contributing Guide](https://superset.apache.org/docs/contributing/development)

### Custom Code Locations
```
superset-frontend/src/
├── features/home/
│   ├── DashboardContentArea.tsx  # Main content with tabs
│   ├── DataSourceSidebar.tsx     # Dashboard list sidebar
│   └── Menu.tsx                  # Top navigation
├── pages/Home/
│   └── EnhancedHome.tsx          # Home page container
└── views/
    ├── App.tsx                   # Route integration
    └── routes.tsx                # Route configuration

superset/
└── initialization/
    └── __init__.py               # Menu configuration

scripts/
├── tag_charts.py                 # Bulk chart tagging utility
└── build-and-package.sh          # Deployment builder
```

---

## Contact & Support

**Project Team**: MOH Uganda - Malaria Data Repository
**Technical Lead**: [Your Name]
**Last Updated**: October 2025

For issues or questions, refer to this guide or contact the development team.
