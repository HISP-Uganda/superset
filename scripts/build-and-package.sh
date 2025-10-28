#!/bin/bash
# Build and Package Script for Malaria Superset Updates
# Run this on your Mac development machine or Ubuntu server

set -e  # Exit on any error

echo "=========================================="
echo "Malaria Superset - Build & Package Script"
echo "=========================================="

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/deployment-build"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="malaria-superset-update-${TIMESTAMP}.tar.gz"

echo "Project root: ${PROJECT_ROOT}"
echo "Build directory: ${BUILD_DIR}"
echo ""

# Step 1: Check and install/upgrade Node.js/npm if needed
echo -e "${YELLOW}[1/8] Checking Node.js and npm installation...${NC}"
echo "Superset requires: Node.js ^20.18.1 and npm ^10.8.1"
echo ""

NODE_VERSION=""
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')
    echo "Current Node.js version: ${NODE_VERSION}"

    if [ "$NODE_MAJOR" -lt 20 ]; then
        echo -e "${YELLOW}Node.js 20.x is required (you have ${NODE_VERSION}).${NC}"
        read -p "Do you want to upgrade to Node.js 20.x? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Upgrading to Node.js 20.x..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            echo -e "${GREEN}✓ Node.js upgraded to $(node --version)${NC}"
        else
            echo -e "${YELLOW}WARNING: Continuing with Node.js ${NODE_VERSION} (may cause build issues)${NC}"
        fi
    elif [ "$NODE_MAJOR" -gt 20 ]; then
        echo -e "${YELLOW}Node.js ${NODE_VERSION} is newer than required 20.x${NC}"
        read -p "Do you want to downgrade to Node.js 20.x? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Uninstalling current Node.js..."
            sudo apt-get remove -y nodejs
            sudo apt-get autoremove -y
            echo "Installing Node.js 20.x..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            echo -e "${GREEN}✓ Node.js downgraded to $(node --version)${NC}"
        else
            echo -e "${YELLOW}WARNING: Continuing with Node.js ${NODE_VERSION} (may cause build issues)${NC}"
        fi
    else
        echo -e "${GREEN}✓ Node.js version is compatible${NC}"
    fi
else
    echo -e "${RED}Node.js not found.${NC}"
    read -p "Do you want to install Node.js 20.x? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        echo -e "${GREEN}✓ Node.js installed: $(node --version)${NC}"
    else
        echo -e "${RED}Node.js is required. Exiting.${NC}"
        exit 1
    fi
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found.${NC}"
    read -p "Do you want to install npm? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing npm..."
        sudo apt-get install -y npm
        echo -e "${GREEN}✓ npm installed: $(npm --version)${NC}"
    else
        echo -e "${RED}npm is required. Exiting.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"
fi

# Step 2: Clean previous build artifacts
echo -e "${YELLOW}[2/8] Cleaning previous build artifacts...${NC}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cd "${PROJECT_ROOT}/superset-frontend"

# Step 3: Install/reinstall dependencies
echo -e "${YELLOW}[3/8] Checking npm dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}npm dependencies not found.${NC}"
    read -p "Install npm dependencies now? This may take 5-10 minutes. (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing npm dependencies..."
        npm ci --legacy-peer-deps
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    else
        echo -e "${RED}Dependencies are required. Exiting.${NC}"
        exit 1
    fi
else
    echo "Dependencies found."
    read -p "Clean reinstall dependencies? This will use npm ci (recommended). (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Clean reinstalling npm dependencies..."
        rm -rf node_modules
        npm ci --legacy-peer-deps
        echo -e "${GREEN}✓ Dependencies reinstalled${NC}"
    else
        echo -e "${GREEN}✓ Using existing dependencies${NC}"
    fi
fi

# Step 4: Install missing peer dependencies
echo -e "${YELLOW}[4/8] Installing missing peer dependencies...${NC}"

# List of commonly missing peer dependencies
MISSING_DEPS=(
    "@react-spring/web"
    "global-box"
    "query-string"
    "@deck.gl/mesh-layers"
    "@deck.gl/extensions"
    "@deck.gl/widgets"
)

echo "Installing missing peer dependencies..."
for dep in "${MISSING_DEPS[@]}"; do
    echo "  - $dep"
done

npm install --legacy-peer-deps --save-dev "${MISSING_DEPS[@]}"

echo -e "${GREEN}✓ Missing dependencies installed${NC}"

# Step 5: Build frontend
echo -e "${YELLOW}[5/8] Building frontend (this may take 5-10 minutes)...${NC}"
npm run build

# Verify build succeeded
if [ ! -d "../superset/static/assets" ]; then
    echo "ERROR: Build failed - assets directory not found"
    exit 1
fi

echo -e "${GREEN}✓ Frontend build complete${NC}"

# Step 6: Package compiled assets
echo -e "${YELLOW}[6/8] Packaging compiled frontend assets...${NC}"
mkdir -p "${BUILD_DIR}/assets"
cp -R "${PROJECT_ROOT}/superset/static/assets/"* "${BUILD_DIR}/assets/"
echo -e "${GREEN}✓ Assets packaged: $(du -sh ${BUILD_DIR}/assets | cut -f1)${NC}"

# Step 7: Copy backend Python file
echo -e "${YELLOW}[7/8] Packaging backend file...${NC}"
mkdir -p "${BUILD_DIR}/backend"
cp "${PROJECT_ROOT}/superset/initialization/__init__.py" "${BUILD_DIR}/backend/__init__.py"
echo -e "${GREEN}✓ Backend file packaged${NC}"

# Step 8: Create deployment script for server
echo -e "${YELLOW}[8/8] Creating server deployment script...${NC}"
cat > "${BUILD_DIR}/deploy-on-server.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash
# Server Deployment Script - Run this on Ubuntu server as root or with sudo

set -e

echo "=========================================="
echo "Malaria Superset - Server Update Script"
echo "=========================================="

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Please run as root or with sudo${NC}"
    exit 1
fi

# Configuration
SUPERSET_PATH="/usr/local/lib/python3.10/dist-packages/superset"
BACKUP_DIR="/root/superset-backups/$(date +%Y%m%d_%H%M%S)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Superset path: ${SUPERSET_PATH}"
echo "Backup directory: ${BACKUP_DIR}"
echo ""

# Step 1: Verify Superset installation
echo -e "${YELLOW}[1/5] Verifying Superset installation...${NC}"
if [ ! -d "${SUPERSET_PATH}" ]; then
    echo -e "${RED}ERROR: Superset not found at ${SUPERSET_PATH}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Superset found${NC}"

# Step 2: Create backup
echo -e "${YELLOW}[2/5] Creating backup...${NC}"
mkdir -p "${BACKUP_DIR}"

# Backup assets
if [ -d "${SUPERSET_PATH}/static/assets" ]; then
    cp -R "${SUPERSET_PATH}/static/assets" "${BACKUP_DIR}/"
    echo -e "${GREEN}✓ Assets backed up${NC}"
fi

# Backup initialization file
if [ -f "${SUPERSET_PATH}/initialization/__init__.py" ]; then
    mkdir -p "${BACKUP_DIR}/initialization"
    cp "${SUPERSET_PATH}/initialization/__init__.py" "${BACKUP_DIR}/initialization/"
    echo -e "${GREEN}✓ Backend file backed up${NC}"
fi

echo "Backup location: ${BACKUP_DIR}"

# Step 3: Stop Superset service
echo -e "${YELLOW}[3/5] Stopping Superset service...${NC}"
if systemctl is-active --quiet superset; then
    systemctl stop superset
    echo -e "${GREEN}✓ Superset service stopped${NC}"
elif systemctl is-active --quiet gunicorn; then
    systemctl stop gunicorn
    echo -e "${GREEN}✓ Gunicorn service stopped${NC}"
else
    echo "Warning: Could not detect Superset service. Continuing anyway..."
fi

# Step 4: Update files
echo -e "${YELLOW}[4/5] Updating files...${NC}"

# Update frontend assets
if [ -d "${SCRIPT_DIR}/assets" ]; then
    rm -rf "${SUPERSET_PATH}/static/assets"/*
    cp -R "${SCRIPT_DIR}/assets/"* "${SUPERSET_PATH}/static/assets/"
    echo -e "${GREEN}✓ Frontend assets updated${NC}"
else
    echo -e "${RED}ERROR: assets directory not found in deployment package${NC}"
    exit 1
fi

# Update backend file
if [ -f "${SCRIPT_DIR}/backend/__init__.py" ]; then
    cp "${SCRIPT_DIR}/backend/__init__.py" "${SUPERSET_PATH}/initialization/__init__.py"
    echo -e "${GREEN}✓ Backend file updated${NC}"
else
    echo -e "${RED}ERROR: Backend file not found in deployment package${NC}"
    exit 1
fi

# Set correct permissions
chown -R www-data:www-data "${SUPERSET_PATH}/static/assets" 2>/dev/null || \
chown -R superset:superset "${SUPERSET_PATH}/static/assets" 2>/dev/null || \
echo "Warning: Could not set ownership (this might be OK)"

# Step 5: Start Superset service
echo -e "${YELLOW}[5/5] Starting Superset service...${NC}"
if systemctl list-units --full -all | grep -q superset.service; then
    systemctl start superset
    sleep 3
    if systemctl is-active --quiet superset; then
        echo -e "${GREEN}✓ Superset service started${NC}"
    else
        echo -e "${RED}ERROR: Failed to start superset service${NC}"
        echo "Check logs: journalctl -u superset -n 50"
        exit 1
    fi
elif systemctl list-units --full -all | grep -q gunicorn.service; then
    systemctl start gunicorn
    sleep 3
    if systemctl is-active --quiet gunicorn; then
        echo -e "${GREEN}✓ Gunicorn service started${NC}"
    else
        echo -e "${RED}ERROR: Failed to start gunicorn service${NC}"
        echo "Check logs: journalctl -u gunicorn -n 50"
        exit 1
    fi
else
    echo -e "${RED}ERROR: Could not find Superset or Gunicorn service${NC}"
    echo "Please start Superset manually"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Backup location: ${BACKUP_DIR}"
echo ""
echo "To rollback if needed:"
echo "  sudo systemctl stop superset  # or gunicorn"
echo "  sudo rm -rf ${SUPERSET_PATH}/static/assets/*"
echo "  sudo cp -R ${BACKUP_DIR}/assets/* ${SUPERSET_PATH}/static/assets/"
echo "  sudo cp ${BACKUP_DIR}/initialization/__init__.py ${SUPERSET_PATH}/initialization/"
echo "  sudo systemctl start superset  # or gunicorn"
echo ""
echo "Check Superset status:"
echo "  sudo systemctl status superset  # or gunicorn"
echo "  sudo journalctl -u superset -f  # view logs"
DEPLOY_SCRIPT

chmod +x "${BUILD_DIR}/deploy-on-server.sh"
echo -e "${GREEN}✓ Deployment script created${NC}"

# Step 9: Create tarball
echo ""
echo -e "${YELLOW}[9/9] Creating deployment package...${NC}"
cd "${BUILD_DIR}"
tar -czf "${PACKAGE_NAME}" assets/ backend/ deploy-on-server.sh
PACKAGE_PATH="${BUILD_DIR}/${PACKAGE_NAME}"
PACKAGE_SIZE=$(du -sh "${PACKAGE_PATH}" | cut -f1)

echo ""
echo -e "${GREEN}=========================================="
echo "Build Complete!"
echo "==========================================${NC}"
echo ""
echo "Package: ${PACKAGE_NAME}"
echo "Size: ${PACKAGE_SIZE}"
echo "Location: ${PACKAGE_PATH}"
echo ""
echo "Next steps:"
echo "1. Transfer package to server:"
echo "   scp ${PACKAGE_PATH} root@YOUR_SERVER_IP:/root/"
echo ""
echo "2. On the server, extract and run:"
echo "   cd /root"
echo "   tar -xzf ${PACKAGE_NAME}"
echo "   cd malaria-superset-update-*"
echo "   sudo ./deploy-on-server.sh"
echo ""
