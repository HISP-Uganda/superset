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
import React, { useEffect, useState } from 'react';
import { Select, Tabs, Tag, Alert } from 'antd';
import { styled, SupersetClient, t } from '@superset-ui/core';

const { TabPane } = Tabs;
const { Option } = Select;

// Removed MAX_PERIODS limit - users can select as many periods as needed

const StyledContainer = styled.div`
  .ant-tabs-nav {
    margin-bottom: 16px;
  }

  .period-limit-warning {
    margin-bottom: 12px;
  }

  .selected-periods-container {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
`;

interface Period {
  id: string;
  displayName: string;
  type: string;
}

interface PeriodSelectorProps {
  databaseId: number;
  value: string[];
  onChange: (periods: string[]) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  databaseId,
  value = [],
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>('years');
  const [years, setYears] = useState<Period[]>([]);
  const [quarters, setQuarters] = useState<Period[]>([]);
  const [months, setMonths] = useState<Period[]>([]);
  const [relativePeriods, setRelativePeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch periods from backend
  const fetchPeriods = async (periodType: string, setter: (periods: Period[]) => void) => {
    try {
      setLoading(true);
      const response = await SupersetClient.get({
        endpoint: `/api/v1/database/${databaseId}/dhis2_metadata/?type=periods&periodType=${periodType}`,
      });

      if (response.json && response.json.result) {
        setter(response.json.result);
      }
    } catch (error) {
      console.error(`Failed to fetch ${periodType} periods:`, error);
    } finally {
      setLoading(false);
    }
  };

  // Load all period types
  useEffect(() => {
    fetchPeriods('YEARLY', setYears);
    fetchPeriods('QUARTERLY', setQuarters);
    fetchPeriods('MONTHLY', setMonths);
    fetchPeriods('RELATIVE', setRelativePeriods);
  }, [databaseId]);

  const handleRemovePeriod = (periodId: string) => {
    onChange(value.filter(p => p !== periodId));
  };

  // Get display name for selected period
  const getPeriodDisplayName = (periodId: string): string => {
    const allPeriods = [...years, ...quarters, ...months, ...relativePeriods];
    const period = allPeriods.find(p => p.id === periodId);
    return period?.displayName || periodId;
  };

  return (
    <StyledContainer>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={t('Years')} key="years">
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={t('Select years')}
            value={value.filter(p => years.some(y => y.id === p))}
            onChange={(selectedYears) => {
              const otherPeriods = value.filter(p => !years.some(y => y.id === p));
              onChange([...otherPeriods, ...selectedYears]);
            }}
            loading={loading}
            maxTagCount={10}
          >
            {years.map(period => (
              <Option
                key={period.id}
                value={period.id}
              >
                {period.displayName}
              </Option>
            ))}
          </Select>
        </TabPane>

        <TabPane tab={t('Quarters')} key="quarters">
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={t('Select quarters')}
            value={value.filter(p => quarters.some(q => q.id === p))}
            onChange={(selectedQuarters) => {
              const otherPeriods = value.filter(p => !quarters.some(q => q.id === p));
              onChange([...otherPeriods, ...selectedQuarters]);
            }}
            loading={loading}
            maxTagCount={10}
          >
            {quarters.map(period => (
              <Option
                key={period.id}
                value={period.id}
              >
                {period.displayName}
              </Option>
            ))}
          </Select>
        </TabPane>

        <TabPane tab={t('Months')} key="months">
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={t('Select months')}
            value={value.filter(p => months.some(m => m.id === p))}
            onChange={(selectedMonths) => {
              const otherPeriods = value.filter(p => !months.some(m => m.id === p));
              onChange([...otherPeriods, ...selectedMonths]);
            }}
            loading={loading}
            maxTagCount={10}
          >
            {months.map(period => (
              <Option
                key={period.id}
                value={period.id}
              >
                {period.displayName}
              </Option>
            ))}
          </Select>
        </TabPane>

        <TabPane tab={t('Relative')} key="relative">
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={t('Select relative periods')}
            value={value.filter(p => relativePeriods.some(r => r.id === p))}
            onChange={(selectedRelative) => {
              const otherPeriods = value.filter(p => !relativePeriods.some(r => r.id === p));
              onChange([...otherPeriods, ...selectedRelative]);
            }}
            loading={loading}
            maxTagCount={10}
          >
            {relativePeriods.map(period => (
              <Option
                key={period.id}
                value={period.id}
              >
                {period.displayName}
              </Option>
            ))}
          </Select>
        </TabPane>
      </Tabs>

      {value.length > 0 && (
        <div className="selected-periods-container">
          <span style={{ marginRight: 8, fontWeight: 'bold' }}>
            {t('Selected')} ({value.length}):
          </span>
          {value.map(periodId => (
            <Tag
              key={periodId}
              closable
              onClose={() => handleRemovePeriod(periodId)}
            >
              {getPeriodDisplayName(periodId)}
            </Tag>
          ))}
        </div>
      )}
    </StyledContainer>
  );
};
