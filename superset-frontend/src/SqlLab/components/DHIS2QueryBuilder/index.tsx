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

import { useState, useCallback } from 'react';
import { styled, t } from '@superset-ui/core';
import { Button, Input, Select, Collapse, Space } from 'antd';
import {
  PlusOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { DHIS2Parameters, RELATIVE_PERIODS, ORG_UNIT_SPECIAL_CODES } from './types';
import { generateDHIS2SQL, validateParameters } from './utils';

const { Panel } = Collapse;

interface DHIS2QueryBuilderProps {
  onInsertSQL: (sql: string) => void;
}

const StyledContainer = styled.div`
  padding: 16px;
  background: #fafafa;
  border-radius: 4px;
  margin: 8px 0;

  .ant-collapse {
    background: #fafafa;
    border: none;
  }

  .section-title {
    font-weight: 600;
    margin-bottom: 8px;
    color: #262626;
  }

  .parameter-section {
    margin-bottom: 12px;
  }

  .preview-container {
    background: #262626;
    color: #fafafa;
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .error-message {
    color: #ff4d4f;
    font-size: 12px;
    margin-top: 4px;
  }

  .button-group {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
`;

export default function DHIS2QueryBuilder({
  onInsertSQL,
}: DHIS2QueryBuilderProps) {
  const [params, setParams] = useState<DHIS2Parameters>({
    dataElements: [],
    periods: [],
    orgUnits: [],
    displayProperty: 'NAME',
    skipMeta: false,
  });

  const [dataElementInput, setDataElementInput] = useState('');
  const [customPeriodInput, setCustomPeriodInput] = useState('');
  const [orgUnitInput, setOrgUnitInput] = useState('');

  const generatedSQL = generateDHIS2SQL(params);
  const errors = validateParameters(params);

  const handleAddDataElement = useCallback(() => {
    if (dataElementInput.trim()) {
      setParams(prev => ({
        ...prev,
        dataElements: [...prev.dataElements, dataElementInput.trim()],
      }));
      setDataElementInput('');
    }
  }, [dataElementInput]);

  const handleRemoveDataElement = useCallback((uid: string) => {
    setParams(prev => ({
      ...prev,
      dataElements: prev.dataElements.filter(de => de !== uid),
    }));
  }, []);

  const handleAddCustomPeriod = useCallback(() => {
    if (customPeriodInput.trim()) {
      setParams(prev => ({
        ...prev,
        periods: [...prev.periods, customPeriodInput.trim()],
      }));
      setCustomPeriodInput('');
    }
  }, [customPeriodInput]);

  const handleAddOrgUnit = useCallback((orgUnit: string) => {
    setParams(prev => ({
      ...prev,
      orgUnits: prev.orgUnits.includes(orgUnit)
        ? prev.orgUnits.filter(ou => ou !== orgUnit)
        : [...prev.orgUnits, orgUnit],
    }));
  }, []);

  const handleAddCustomOrgUnit = useCallback(() => {
    if (orgUnitInput.trim()) {
      setParams(prev => ({
        ...prev,
        orgUnits: [...prev.orgUnits, orgUnitInput.trim()],
      }));
      setOrgUnitInput('');
    }
  }, [orgUnitInput]);

  const handleInsertSQL = useCallback(() => {
    if (errors.length === 0) {
      onInsertSQL(generatedSQL);
    }
  }, [errors, generatedSQL, onInsertSQL]);

  const handleCopySQL = useCallback(() => {
    navigator.clipboard.writeText(generatedSQL);
  }, [generatedSQL]);

  const handleClear = useCallback(() => {
    setParams({
      dataElements: [],
      periods: [],
      orgUnits: [],
      displayProperty: 'NAME',
      skipMeta: false,
    });
  }, []);

  return (
    <StyledContainer>
      <div className="section-title">
        <CodeOutlined /> {t('DHIS2 Query Builder')}
      </div>

      <Collapse defaultActiveKey={['1', '2', '3']}>
        {/* Data Elements */}
        <Panel header={t('Data Elements')} key="1">
          <div className="parameter-section">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder={t('Enter data element UID')}
                value={dataElementInput}
                onChange={e => setDataElementInput(e.target.value)}
                onPressEnter={handleAddDataElement}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddDataElement}
              >
                {t('Add')}
              </Button>
            </Space.Compact>

            <div style={{ marginTop: 8 }}>
              {params.dataElements.map(uid => (
                <div
                  key={uid}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: '#f5f5f5',
                    borderRadius: 4,
                    marginBottom: 4,
                  }}
                >
                  <span>{uid}</span>
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveDataElement(uid)}
                  />
                </div>
              ))}
            </div>
            <small>{params.dataElements.length} selected</small>
          </div>
        </Panel>

        {/* Periods */}
        <Panel header={t('Periods')} key="2">
          <div className="parameter-section">
            <div className="section-title" style={{ fontSize: 12 }}>
              {t('Relative Periods')}
            </div>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder={t('Select relative periods')}
              value={params.periods.filter(p =>
                RELATIVE_PERIODS.some(rp => rp.id === p),
              )}
              onChange={values => {
                setParams(prev => ({
                  ...prev,
                  periods: [
                    ...values,
                    ...prev.periods.filter(
                      p => !RELATIVE_PERIODS.some(rp => rp.id === p),
                    ),
                  ],
                }));
              }}
              options={RELATIVE_PERIODS.map(period => ({
                label: period.name,
                value: period.id,
              }))}
            />

            <div style={{ marginTop: 12 }}>
              <div className="section-title" style={{ fontSize: 12 }}>
                {t('Custom Periods (e.g., 2024, 2023Q1, 202401)')}
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={t('Enter period code')}
                  value={customPeriodInput}
                  onChange={e => setCustomPeriodInput(e.target.value)}
                  onPressEnter={handleAddCustomPeriod}
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddCustomPeriod}
                >
                  {t('Add')}
                </Button>
              </Space.Compact>
            </div>

            <small>{params.periods.length} selected</small>
          </div>
        </Panel>

        {/* Org Units */}
        <Panel header={t('Organisation Units')} key="3">
          <div className="parameter-section">
            <div className="section-title" style={{ fontSize: 12 }}>
              {t('Quick Select')}
            </div>
            <Space wrap>
              {ORG_UNIT_SPECIAL_CODES.map(code => (
                <Button
                  key={code.id}
                  size="small"
                  type={params.orgUnits.includes(code.id) ? 'primary' : 'default'}
                  onClick={() => handleAddOrgUnit(code.id)}
                >
                  {code.name}
                </Button>
              ))}
            </Space>

            <div style={{ marginTop: 12 }}>
              <div className="section-title" style={{ fontSize: 12 }}>
                {t('Custom Org Units (UID)')}
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={t('Enter org unit UID')}
                  value={orgUnitInput}
                  onChange={e => setOrgUnitInput(e.target.value)}
                  onPressEnter={handleAddCustomOrgUnit}
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddCustomOrgUnit}
                >
                  {t('Add')}
                </Button>
              </Space.Compact>
            </div>

            <small>{params.orgUnits.length} selected</small>
          </div>
        </Panel>

        {/* Options */}
        <Panel header={t('Options')} key="4">
          <div className="parameter-section">
            <div style={{ marginBottom: 12 }}>
              <label>{t('Display Property')}</label>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={params.displayProperty}
                onChange={value =>
                  setParams(prev => ({ ...prev, displayProperty: value }))
                }
                options={[
                  { label: 'Full Names', value: 'NAME' },
                  { label: 'Short Names', value: 'SHORT_NAME' },
                  { label: 'Codes', value: 'CODE' },
                ]}
              />
            </div>
          </div>
        </Panel>
      </Collapse>

      {/* Preview */}
      <div style={{ marginTop: 16 }}>
        <div className="section-title">{t('Generated SQL')}</div>
        <div className="preview-container">{generatedSQL}</div>

        {errors.length > 0 && (
          <div className="error-message">
            {errors.map((error, idx) => (
              <div key={idx}>• {error}</div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="button-group">
        <Button
          type="primary"
          icon={<CodeOutlined />}
          onClick={handleInsertSQL}
          disabled={errors.length > 0}
        >
          {t('Insert at Cursor')}
        </Button>
        <Button icon={<CopyOutlined />} onClick={handleCopySQL}>
          {t('Copy SQL')}
        </Button>
        <Button icon={<DeleteOutlined />} onClick={handleClear} danger>
          {t('Clear All')}
        </Button>
      </div>
    </StyledContainer>
  );
}
