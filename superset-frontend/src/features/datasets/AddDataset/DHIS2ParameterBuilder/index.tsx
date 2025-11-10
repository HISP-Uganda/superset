/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useState, useEffect, useRef } from 'react';
import { t, styled, SupersetClient } from '@superset-ui/core';
import { Select, Typography, Space, Tag, Divider, Button, Modal, Table as AntTable, Input } from 'antd';
import { PeriodSelector } from './PeriodSelector';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface DHIS2Dimension {
  id: string;
  displayName: string;
  type: 'dataElement' | 'indicator' | 'dataSet';
}

interface DHIS2OrgUnit {
  id: string;
  displayName: string;
  level?: number;
  path?: string;
}

interface DHIS2ParameterBuilderProps {
  databaseId?: number;
  endpoint?: string | null;
  onParametersChange?: (parameters: Record<string, string>) => void;
  onColumnsChange?: (columns: Array<{ name: string; type: string }>) => void;
  onDatasetNameChange?: (name: string) => void;
  initialParameters?: Record<string, string>;
  initialDatasetName?: string;
}

const Container = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 4}px;
    background: #fafafa;
    border-radius: ${theme.borderRadius}px;
    margin: ${theme.sizeUnit * 2}px 0;
  `}
`;

const ParameterSection = styled.div`
  ${({ theme }) => `
    margin-bottom: ${theme.sizeUnit * 4}px;
  `}
`;

const StyledSelect = styled(Select)`
  width: 100%;
`;

const InfoBox = styled.div`
  ${({ theme }) => `
    background: #e6f7ff;
    border-left: 4px solid #1890ff;
    padding: ${theme.sizeUnit * 2}px;
    margin-bottom: ${theme.sizeUnit * 3}px;
    border-radius: ${theme.borderRadius}px;
  `}
`;

// NOTE: PERIOD_OPTIONS removed - now using PeriodSelector component with tabs

// Predefined org unit options
const ORGUNIT_OPTIONS = [
  { value: 'USER_ORGUNIT', label: 'User Organization Unit' },
  { value: 'USER_ORGUNIT_CHILDREN', label: 'User Org Unit Children' },
  { value: 'USER_ORGUNIT_GRANDCHILDREN', label: 'User Org Unit Grandchildren' },
];

/**
 * Extract the source table name from a dataset name
 *
 * Pattern: {source_table}_{custom_suffix}
 * Examples:
 *   "analytics_malaria_cases" -> "analytics"
 *   "analytics_version2" -> "analytics"
 *   "dataValueSets_monthly" -> "dataValueSets"
 *
 * @param datasetName - The full dataset name
 * @returns The source table name (first part before underscore)
 */
export function parseSourceTable(datasetName: string | null | undefined): string | null {
  if (!datasetName) return null;

  // Split by underscore and take the first part
  const parts = datasetName.split('_');
  return parts[0] || null;
}

/**
 * DHIS2 Parameter Builder Component
 * Visual query builder for DHIS2 analytics endpoint
 * Allows users to select dx (data), pe (period), and ou (org units) without SQL
 */
export default function DHIS2ParameterBuilder({
  databaseId,
  endpoint,
  onParametersChange,
  onColumnsChange,
  onDatasetNameChange,
  initialParameters = {},
  initialDatasetName,
}: DHIS2ParameterBuilderProps) {
  const [dataElements, setDataElements] = useState<DHIS2Dimension[]>([]);
  const [indicators, setIndicators] = useState<DHIS2Dimension[]>([]);
  const [orgUnits, setOrgUnits] = useState<DHIS2OrgUnit[]>([]);
  const [selectedOrgUnitLevel, setSelectedOrgUnitLevel] = useState<number | null>(1); // Default to level 1 (countries)
  const [loading, setLoading] = useState(false);
  const [datasetName, setDatasetName] = useState<string>(initialDatasetName || '');
  const [userEditedName, setUserEditedName] = useState(false); // Track if user manually edited the name

  // Selected values (use semicolons to split values within dimension)
  const [selectedData, setSelectedData] = useState<string[]>(
    initialParameters.dimension?.split(';').find(d => d.startsWith('dx:'))?.replace('dx:', '').split(';') || []
  );
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(
    initialParameters.dimension?.split(';').find(d => d.startsWith('pe:'))?.replace('pe:', '').split(';') || ['LAST_YEAR']
  );
  const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>(
    initialParameters.dimension?.split(';').find(d => d.startsWith('ou:'))?.replace('ou:', '').split(';') || ['USER_ORGUNIT']
  );

  // Preview modal state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewColumns, setPreviewColumns] = useState<any[]>([]);
  const [generatedApiUrl, setGeneratedApiUrl] = useState<string>(''); // Human-readable decoded URL

  // Load metadata from DHIS2 when component mounts or level changes
  useEffect(() => {
    if (databaseId && endpoint) {
      loadMetadata();
    }
  }, [databaseId, endpoint, selectedOrgUnitLevel]);

  // Auto-generate suggested dataset name with pattern: {source_table}_{custom_suffix}
  useEffect(() => {
    // Only auto-generate if user hasn't manually edited and name is empty or default
    if (!userEditedName && (!datasetName || datasetName === endpoint || datasetName === initialDatasetName)) {
      const parts: string[] = [];

      // Add first data element name if available (more descriptive)
      if (selectedData.length > 0 && dataElements.length > 0) {
        const firstDE = dataElements.find(de => de.id === selectedData[0]);
        if (firstDE) {
          // Clean name: remove special chars, limit length
          const cleanName = firstDE.displayName
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
          parts.push(cleanName);
        }
      }

      // Add period info
      if (selectedPeriods.length > 0) {
        parts.push(selectedPeriods[0].replace(/\s+/g, '_'));
      }

      // Generate name with pattern: {source_table}_{suffix}
      // Example: analytics_malaria_cases_2024Q1
      const suffix = parts.length > 0 ? parts.join('_') : 'dataset';
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
      const suggested = `${endpoint}_${suffix}_${timestamp}`;

      if (suggested !== datasetName) {
        setDatasetName(suggested);
      }
    }
  }, [selectedData, selectedPeriods, dataElements, endpoint]);

  // Notify parent when dataset name changes (debounced to avoid infinite loops)
  const onDatasetNameChangeRef = useRef(onDatasetNameChange);
  const endpointRef = useRef(endpoint);

  useEffect(() => {
    onDatasetNameChangeRef.current = onDatasetNameChange;
    endpointRef.current = endpoint;
  });

  useEffect(() => {
    if (onDatasetNameChangeRef.current && datasetName && datasetName !== endpointRef.current) {
      const timeoutId = setTimeout(() => {
        onDatasetNameChangeRef.current?.(datasetName);
      }, 300); // Debounce 300ms

      return () => clearTimeout(timeoutId);
    }
    return undefined; // Return undefined when condition is false
  }, [datasetName]);

  // Update parent when selections change
  useEffect(() => {
    if (!onParametersChange) {
      return;
    }

    const parameters: Record<string, string> = {};

    if (endpoint === 'analytics') {
      // Build dimension parameter: dx:id1;id2;pe:LAST_YEAR;ou:USER_ORGUNIT
      // Note: DHIS2 uses semicolons to separate multiple values within same dimension
      const dimensions: string[] = [];
      if (selectedData.length > 0) {
        dimensions.push(`dx:${selectedData.join(';')}`);
      }
      if (selectedPeriods.length > 0) {
        dimensions.push(`pe:${selectedPeriods.join(';')}`);
      }
      if (selectedOrgUnits.length > 0) {
        dimensions.push(`ou:${selectedOrgUnits.join(';')}`);
      }
      if (dimensions.length > 0) {
        parameters.dimension = dimensions.join(';');
      }
      parameters.displayProperty = 'NAME';
      parameters.skipMeta = 'false';
    } else if (endpoint === 'dataValueSets') {
      // dataValueSets uses different parameter format
      if (selectedData.length > 0) {
        parameters.dataElement = selectedData.join(',');
      }
      if (selectedPeriods.length > 0) {
        parameters.period = selectedPeriods.join(',');
      }
      if (selectedOrgUnits.length > 0) {
        parameters.orgUnit = selectedOrgUnits.join(',');
      }
    } else {
      // For other DHIS2 endpoints, support filter parameters
      // Example: dataElements?filter=id:in:[FTRrcoaog83,P3jJH5Tu5VC]
      if (selectedData.length > 0) {
        parameters.filter = `id:in:[${selectedData.join(',')}]`;
      }
      parameters.fields = 'id,displayName,name,code,created,lastUpdated';
      parameters.paging = 'false';
    }

    onParametersChange(parameters);

    // Generate expected column structure for DHIS2 (dynamic based on endpoint)
    if (onColumnsChange) {
      const columns: Array<{ name: string; type: string }> = [];

      // Generate columns dynamically based on selected endpoint
      // For analytics-type endpoints with dimensional data, generate pivoted columns
      if (endpoint === 'analytics' && selectedData.length > 0) {
        console.log('[DHIS2 Columns] Generating analytics columns - selectedData:', selectedData.length, 'dataElements:', dataElements.length);

        // Always include Period and OrgUnit columns
        columns.push({ name: 'Period', type: 'VARCHAR(255)' });
        columns.push({ name: 'OrgUnit', type: 'VARCHAR(255)' });

        // Add a column for each selected data element/indicator
        const allDataDimensions = [...dataElements, ...indicators];
        selectedData.forEach(dataId => {
          const dimension = allDataDimensions.find(d => d.id === dataId);
          const columnName = dimension?.displayName || dataId;
          columns.push({ name: columnName, type: 'FLOAT' });
          console.log('[DHIS2 Columns] Added column:', columnName, 'for ID:', dataId);
        });
      } else if (endpoint === 'dataValueSets') {
        // dataValueSets returns unpivoted data
        columns.push({ name: 'dataElement', type: 'VARCHAR(255)' });
        columns.push({ name: 'period', type: 'VARCHAR(255)' });
        columns.push({ name: 'orgUnit', type: 'VARCHAR(255)' });
        columns.push({ name: 'value', type: 'VARCHAR(255)' });
        columns.push({ name: 'storedBy', type: 'VARCHAR(255)' });
        columns.push({ name: 'created', type: 'TIMESTAMP' });
        columns.push({ name: 'lastUpdated', type: 'TIMESTAMP' });
      } else {
        // For any other DHIS2 endpoint, generate generic columns
        // This will be dynamically populated when data is actually fetched
        columns.push({ name: 'id', type: 'VARCHAR(255)' });
        columns.push({ name: 'displayName', type: 'VARCHAR(255)' });
        columns.push({ name: 'name', type: 'VARCHAR(255)' });
        columns.push({ name: 'code', type: 'VARCHAR(255)' });
        columns.push({ name: 'created', type: 'TIMESTAMP' });
        columns.push({ name: 'lastUpdated', type: 'TIMESTAMP' });
      }

      console.log('Generated DHIS2 columns for', endpoint, ':', columns);
      onColumnsChange(columns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedData, selectedPeriods, selectedOrgUnits, endpoint, dataElements, indicators]);

  const loadMetadata = async () => {
    if (!databaseId) return;

    // Determine table name from endpoint
    const tableName = endpoint || 'analytics';
    console.log('[DHIS2 Query Builder] Loading metadata for database:', databaseId, 'table:', tableName);
    setLoading(true);
    try {
      // Fetch data elements (filtered by table for analytics)
      console.log('[DHIS2 Query Builder] Fetching data elements for table:', tableName);
      const dataElementsUrl = tableName === 'analytics'
        ? `/api/v1/database/${databaseId}/dhis2_metadata/?type=dataElements&table=${tableName}`
        : `/api/v1/database/${databaseId}/dhis2_metadata/?type=dataElements`;

      const dataElementsResponse = await fetch(dataElementsUrl, {
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('[DHIS2 Query Builder] Data elements response:', dataElementsResponse.status);
      if (dataElementsResponse.ok) {
        const data = await dataElementsResponse.json();
        console.log('[DHIS2 Query Builder] Data elements loaded:', data.result?.length || 0, '(filtered for', tableName, ')');
        setDataElements(
          data.result.map((item: any) => ({
            id: item.id,
            displayName: item.displayName,
            type: 'dataElement' as const,
            category: item.category || 'Data Elements',
            typeInfo: item.typeInfo,
          }))
        );
      } else {
        const errorText = await dataElementsResponse.text();
        console.error('[DHIS2 Query Builder] Failed to load data elements:', dataElementsResponse.status, errorText);
      }

      // Fetch indicators (always aggregatable, no filtering needed)
      console.log('[DHIS2 Query Builder] Fetching indicators...');
      const indicatorsResponse = await fetch(
        `/api/v1/database/${databaseId}/dhis2_metadata/?type=indicators`,
        {
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[DHIS2 Query Builder] Indicators response:', indicatorsResponse.status);
      if (indicatorsResponse.ok) {
        const data = await indicatorsResponse.json();
        console.log('[DHIS2 Query Builder] Indicators loaded:', data.result?.length || 0);
        setIndicators(
          data.result.map((item: any) => ({
            id: item.id,
            displayName: item.displayName,
            type: 'indicator' as const,
            category: 'Indicators',
          }))
        );
      } else {
        const errorText = await indicatorsResponse.text();
        console.error('[DHIS2 Query Builder] Failed to load indicators:', indicatorsResponse.status, errorText);
      }

      // Fetch organization units (filtered by level if selected)
      console.log('[DHIS2 Query Builder] Fetching organization units (level:', selectedOrgUnitLevel, ')...');
      const orgUnitsUrl = selectedOrgUnitLevel
        ? `/api/v1/database/${databaseId}/dhis2_metadata/?type=organisationUnits&level=${selectedOrgUnitLevel}`
        : `/api/v1/database/${databaseId}/dhis2_metadata/?type=organisationUnits`;

      const orgUnitsResponse = await fetch(
        orgUnitsUrl,
        {
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[DHIS2 Query Builder] Org units response:', orgUnitsResponse.status);
      if (orgUnitsResponse.ok) {
        const data = await orgUnitsResponse.json();
        console.log('[DHIS2 Query Builder] Org units loaded:', data.result?.length || 0);
        setOrgUnits(
          data.result.map((item: any) => ({
            id: item.id,
            displayName: item.displayName,
            level: item.level,
            parent: item.parent,
          }))
        );
      } else {
        const errorText = await orgUnitsResponse.text();
        console.error('[DHIS2 Query Builder] Failed to load org units:', orgUnitsResponse.status, errorText);
      }
    } catch (error) {
      console.error('[DHIS2 Query Builder] Failed to load DHIS2 metadata:', error);
    } finally {
      setLoading(false);
      console.log('[DHIS2 Query Builder] Metadata loading complete');
    }
  };

  // Show builder for ALL DHIS2 endpoints
  if (!endpoint) {
    return null;
  }

  return (
    <Container>
      <Title level={4}>
        {t('DHIS2 Query Builder')}
      </Title>

      <InfoBox>
        <Paragraph style={{ margin: 0 }}>
          {t('Build your DHIS2 query visually by selecting data elements, periods, and organization units. No SQL required!')}
        </Paragraph>
      </InfoBox>

      {/* Dataset Name Input */}
      <ParameterSection>
        <Title level={5}>{t('Dataset Name')}</Title>
        <Paragraph type="secondary">
          {t('Customize the name for this dataset (auto-generated based on your selections)')}
        </Paragraph>
        <Input
          value={datasetName}
          onChange={(e) => {
            setDatasetName(e.target.value);
            setUserEditedName(true); // Mark as user-edited to stop auto-generation
          }}
          placeholder={t('Enter dataset name...')}
          style={{ width: '100%' }}
        />
      </ParameterSection>

      <Divider />

      {/* Visual Query Builder */}

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Data Dimension (dx) */}
        <ParameterSection>
          <Title level={5}>{t('Data (dx)')}</Title>
          <Paragraph type="secondary">
            {endpoint === 'analytics' && t('Select aggregatable data elements or indicators (filtered for analytics table)')}
            {endpoint === 'events' && t('Select tracker program data elements or indicators')}
            {endpoint === 'dataValueSets' && t('Select any data elements (raw data entry values)')}
            {endpoint === 'trackedEntityInstances' && t('Select tracked entity attributes (not data elements)')}
            {!['analytics', 'events', 'dataValueSets', 'trackedEntityInstances'].includes(endpoint || '') && t('Select data elements or indicators to include in your query')}
          </Paragraph>
          {endpoint === 'analytics' && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#52c41a' }}>
              ✓ Showing only numeric, aggregatable data elements compatible with analytics table
            </div>
          )}
          {endpoint === 'events' && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#1890ff' }}>
              ℹ Showing only tracker program data elements
            </div>
          )}
          {endpoint === 'dataValueSets' && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#1890ff' }}>
              ℹ Showing all data elements (any type)
            </div>
          )}
          <StyledSelect
            mode="multiple"
            placeholder={t('Select data elements or indicators')}
            value={selectedData}
            onChange={setSelectedData}
            loading={loading}
            filterOption={(input, option) =>
              (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {indicators.length > 0 && (
              <>
                <Option value="" disabled style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                  {t('📊 Indicators (Always Aggregatable)')}
                </Option>
                {indicators.map(ind => (
                  <Option key={ind.id} value={ind.id}>
                    {ind.displayName}
                  </Option>
                ))}
              </>
            )}
            {dataElements.length > 0 && (
              <>
                <Option value="" disabled style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0', marginTop: 8 }}>
                  {endpoint === 'analytics' && t('📈 Data Elements (Numeric, Aggregatable)')}
                  {endpoint === 'events' && t('📈 Data Elements (Tracker Programs)')}
                  {endpoint === 'dataValueSets' && t('📈 Data Elements (All Types)')}
                  {!['analytics', 'events', 'dataValueSets'].includes(endpoint || '') && t('📈 Data Elements')}
                </Option>
                {dataElements.map(de => (
                  <Option key={de.id} value={de.id}>
                    {de.displayName}
                  </Option>
                ))}
              </>
            )}
          </StyledSelect>
          {selectedData.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedData.map(id => (
                <Tag key={id} closable onClose={() => setSelectedData(selectedData.filter(d => d !== id))}>
                  {dataElements.find(de => de.id === id)?.displayName ||
                   indicators.find(ind => ind.id === id)?.displayName ||
                   id}
                </Tag>
              ))}
            </div>
          )}
        </ParameterSection>

        <Divider />

        {/* Period Dimension (pe) */}
        <ParameterSection>
          <Title level={5}>{t('Period (pe)')}</Title>
          <Paragraph type="secondary">
            {t('Select time periods for your data (max 5)')}
          </Paragraph>
          <PeriodSelector
            databaseId={databaseId!}
            value={selectedPeriods}
            onChange={setSelectedPeriods}
          />
        </ParameterSection>

        <Divider />

        {/* Organization Unit Dimension (ou) */}
        <ParameterSection>
          <Title level={5}>{t('Organization Unit (ou)')}</Title>
          <Paragraph type="secondary">
            {t('Select organization units to filter your data')}
          </Paragraph>

          {/* Org Unit Level Filter */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              {t('Organization Unit Level')}
            </label>
            <StyledSelect
              value={selectedOrgUnitLevel}
              onChange={(value) => {
                setSelectedOrgUnitLevel(value as number | null);
                setSelectedOrgUnits([]); // Clear selections when level changes
              }}
              placeholder={t('Select level')}
              style={{ width: '100%' }}
            >
              <Option value={null}>{t('All Levels')}</Option>
              <Option value={1}>{t('Level 1 - National/Country')}</Option>
              <Option value={2}>{t('Level 2 - Province/State')}</Option>
              <Option value={3}>{t('Level 3 - District')}</Option>
              <Option value={4}>{t('Level 4 - Sub-district')}</Option>
              <Option value={5}>{t('Level 5 - Facility')}</Option>
              <Option value={6}>{t('Level 6 - Sub-facility')}</Option>
            </StyledSelect>
          </div>

          <StyledSelect
            mode="multiple"
            placeholder={t('Select organization units')}
            value={selectedOrgUnits}
            onChange={setSelectedOrgUnits}
            loading={loading}
            filterOption={(input, option) =>
              (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {orgUnits.map(ou => (
              <Option key={ou.id} value={ou.id}>
                {ou.displayName}
              </Option>
            ))}
          </StyledSelect>
          {selectedOrgUnits.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedOrgUnits.map(ou => (
                <Tag key={ou} closable onClose={() => setSelectedOrgUnits(selectedOrgUnits.filter(o => o !== ou))}>
                  {ORGUNIT_OPTIONS.find(o => o.value === ou)?.label ||
                   orgUnits.find(o => o.id === ou)?.displayName ||
                   ou}
                </Tag>
              ))}
            </div>
          )}
        </ParameterSection>

        <Divider />

        {/* Preview Data Section */}
        <ParameterSection>
          <Button
            type="primary"
            onClick={async () => {
              if (!databaseId) {
                alert('No database selected');
                return;
              }

              // Build parameters for all endpoint types
              const params: Record<string, string> = {};

              if (endpoint === 'analytics') {
                const dimensions = [];
                if (selectedData.length > 0) {
                  dimensions.push(`dx:${selectedData.join(';')}`);
                }
                if (selectedPeriods.length > 0) {
                  dimensions.push(`pe:${selectedPeriods.join(';')}`);
                }
                if (selectedOrgUnits.length > 0) {
                  dimensions.push(`ou:${selectedOrgUnits.join(';')}`);
                }
                if (dimensions.length > 0) {
                  params.dimension = dimensions.join(';');
                }
                params.displayProperty = 'NAME';
                params.skipMeta = 'false';
              } else if (endpoint === 'dataValueSets') {
                if (selectedData.length > 0) {
                  params.dataElement = selectedData.join(',');
                }
                if (selectedPeriods.length > 0) {
                  params.period = selectedPeriods.join(',');
                }
                if (selectedOrgUnits.length > 0) {
                  params.orgUnit = selectedOrgUnits.join(',');
                }
              } else {
                // Other endpoints use filter parameter
                if (selectedData.length > 0) {
                  params.filter = `id:in:[${selectedData.join(',')}]`;
                }
                params.fields = 'id,displayName,name,code,created,lastUpdated';
                params.paging = 'false';
              }

              // Validate that at least one data element is selected
              if (!params.dimension && !params.dataElement && !params.filter) {
                alert('Please select at least one data element or indicator');
                return;
              }

              setLoading(true);
              try {
                // Build human-readable decoded URL (NOT encoded)
                // This URL will have : and ; characters, not %3A and %3B
                const decodedParts: string[] = [];
                Object.entries(params).forEach(([key, value]) => {
                  if (key === 'dimension') {
                    // Split dimension string into separate dx:, pe:, ou: parts
                    // Input: "dx:A;B;C;pe:X;Y;ou:Z"
                    // Output: ["dx:A;B;C", "pe:X;Y", "ou:Z"]
                    const dimensionTypes = value.split(/;(?=(?:dx|pe|ou):)/);
                    dimensionTypes.forEach(dim => {
                      decodedParts.push(`dimension=${dim}`);
                    });
                  } else {
                    decodedParts.push(`${key}=${value}`);
                  }
                });
                const decodedUrl = `api/${endpoint}?${decodedParts.join('&')}`;
                setGeneratedApiUrl(decodedUrl);

                // For SQL comment, use encoded version
                const queryParams = new URLSearchParams(params as any).toString();

                // Use Superset's SQL Lab execute endpoint to preview data
                const sql = `-- DHIS2: ${queryParams}\nSELECT * FROM ${endpoint} LIMIT 50`;

                const response = await SupersetClient.post({
                  endpoint: `/api/v1/sqllab/execute/`,
                  jsonPayload: {
                    database_id: databaseId,
                    sql,
                    schema: 'dhis2',
                  },
                });

                console.log('Preview data response:', response.json);

                if (response.json.data && response.json.data.length > 0) {
                  // Convert columns to Ant Design Table format
                  const columns = response.json.columns.map((col: any) => ({
                    title: col.name,
                    dataIndex: col.name,
                    key: col.name,
                    ellipsis: true,
                  }));

                  // Add row keys for Ant Design Table
                  const dataWithKeys = response.json.data.map((row: any, idx: number) => ({
                    ...row,
                    key: idx,
                  }));

                  setPreviewColumns(columns);
                  setPreviewData(dataWithKeys);
                  setPreviewVisible(true);
                } else {
                  alert('⚠️ No data returned.\n\nPossible reasons:\n- No data exists for these parameters\n- Check if IDs are correct\n- Try different date range');
                  console.log('Empty response:', response.json);
                }
              } catch (error: any) {
                console.error('Preview error:', error);
                const errorMsg = error.message || error.toString();
                alert(`❌ Error loading preview:\n\n${errorMsg}\n\nCheck browser console for details.`);
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
            disabled={selectedData.length === 0}
          >
            {t('Preview Data')}
          </Button>
          <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
            {t('Click to preview data and see the generated API URL')}
          </Paragraph>
        </ParameterSection>
      </Space>

      {/* Preview Data Modal with improved design */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>DHIS2 Data Preview</span>
            <Tag color="blue">{previewData.length} rows</Tag>
          </div>
        }
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={1200}
        footer={[
          <Button
            key="copy"
            onClick={() => {
              navigator.clipboard.writeText(generatedApiUrl);
              alert('API URL copied to clipboard!');
            }}
          >
            Copy API URL
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreviewVisible(false)}>
            Close
          </Button>,
        ]}
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
          {/* API URL Section - Single Decoded URL */}
          <div style={{
            padding: 20,
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #d9d9d9'
          }}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 14 }}>🔗 Generated API URL</Text>
              <Tag color="green">Ready to use</Tag>
            </div>
            <TextArea
              value={generatedApiUrl}
              readOnly
              autoSize={{ minRows: 2, maxRows: 4 }}
              style={{
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: 12,
                backgroundColor: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                padding: 12
              }}
            />
            <Paragraph
              type="secondary"
              style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
            >
              💡 Use this URL to query DHIS2 directly or paste it into other tools. URL uses readable format with <code>:</code> and <code>;</code> characters.
            </Paragraph>
          </div>

          {/* Data Table with better spacing */}
          <div style={{
            padding: 20,
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#fff'
          }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 14 }}>📊 Data Sample</Text>
              <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
                Showing first {previewData.length} rows from your query
              </Paragraph>
            </div>
            <AntTable
              columns={previewColumns}
              dataSource={previewData}
              scroll={{ x: 'max-content', y: 350 }}
              pagination={false}
              size="small"
              bordered
              style={{
                backgroundColor: '#fff',
                borderRadius: 4
              }}
            />
          </div>
        </div>
      </Modal>
    </Container>
  );
}
