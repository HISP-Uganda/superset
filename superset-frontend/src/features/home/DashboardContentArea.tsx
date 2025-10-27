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

import { useState, useEffect } from 'react';
import { styled, t, SupersetClient } from '@superset-ui/core';
import { Tabs, Empty, Card, Spin, Button } from 'antd';
import { Icons } from '@superset-ui/core/components/Icons';

const ContentContainer = styled.div`
  ${({ theme }) => `
    margin-left: 280px;
    padding: ${theme.sizeUnit * 6}px ${theme.sizeUnit * 8}px;
    background: ${theme.colorBgLayout};
    min-height: calc(100vh - 60px);
    max-width: 100%;
    width: 100%;

    @media (max-width: 768px) {
      margin-left: 0;
      padding: ${theme.sizeUnit * 4}px ${theme.sizeUnit * 4}px;
    }
  `}
`;

const ContentHeader = styled.div`
  ${({ theme }) => `
    margin-bottom: ${theme.sizeUnit * 4}px;

    h2 {
      font-size: 24px;
      font-weight: 600;
      color: ${theme.colorText};
      margin: 0 0 ${theme.sizeUnit}px 0;
    }

    p {
      font-size: 14px;
      color: ${theme.colorTextSecondary};
      margin: 0;
    }
  `}
`;

const StyledTabs = styled(Tabs)`
  ${({ theme }) => `
    .ant-tabs-nav {
      margin-bottom: ${theme.sizeUnit * 4}px;

      &::before {
        border-bottom: 2px solid ${theme.colorBorderSecondary};
      }
    }

    .ant-tabs-tab {
      font-size: 15px;
      font-weight: 500;
      padding: ${theme.sizeUnit * 3}px ${theme.sizeUnit * 4}px;
      color: ${theme.colorTextSecondary};

      &:hover {
        color: ${theme.colorPrimary};
      }

      &.ant-tabs-tab-active .ant-tabs-tab-btn {
        color: ${theme.colorPrimary};
        font-weight: 600;
      }
    }

    .ant-tabs-ink-bar {
      background: ${theme.colorPrimary};
      height: 3px;
    }
  `}
`;

const ChartGrid = styled.div`
  ${({ theme }) => `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
    gap: ${theme.sizeUnit * 6}px;
    margin-bottom: ${theme.sizeUnit * 6}px;
    margin-top: ${theme.sizeUnit * 4}px;

    @media (max-width: 1600px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 1200px) {
      grid-template-columns: 1fr;
    }

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  `}
`;

const EmptyStateContainer = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 12}px 0;
    text-align: center;
  `}
`;

const ViewMoreButton = styled(Button)`
  ${({ theme }) => `
    width: 100%;
    height: 56px;
    font-size: 16px;
    font-weight: 500;
    margin-top: ${theme.sizeUnit * 6}px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${theme.sizeUnit * 2}px;

    .anticon {
      font-size: 20px;
    }
  `}
`;

const ChartPreviewContainer = styled.div`
  ${({ theme }) => `
    border: 1px solid ${theme.colorBorderSecondary};
    border-radius: ${theme.borderRadiusLG}px;
    overflow: hidden;
    background: ${theme.colorBgContainer};
    height: 400px;
  `}
`;

interface Dashboard {
  id: number;
  dashboard_title: string;
  slug: string;
  url: string;
}

interface Category {
  key: string;
  label: string;
  chartIds: number[];
}

interface ChartItem {
  id: number;
  slice_name: string;
  description: string;
  thumbnail_url?: string;
  url: string;
  viz_type: string;
  tags?: Array<{ id: number; name: string; type: string }>;
}

interface DashboardContentAreaProps {
  selectedDashboard: Dashboard;
}

interface DashboardLayout {
  [key: string]: {
    id: string;
    type: string;
    meta?: {
      text?: string;
    };
    children?: string[];
  };
}

// Default fallback categories if dashboard has no tabs
const DEFAULT_CATEGORIES: Category[] = [
  { key: 'all', label: 'All Charts', chartIds: [] },
];

// Extract tabs and their chart IDs from dashboard layout
function extractTabsFromLayout(positionData: DashboardLayout): Category[] {
  const categories: Category[] = [];

  console.log('Analyzing position data structure...');
  console.log('All component types:', Object.entries(positionData).map(([k, v]) => `${k}: ${v.type}`));

  // Find TABS components in the layout
  Object.entries(positionData).forEach(([key, component]) => {
    console.log(`Checking component ${key} with type ${component.type}`);

    if (component.type === 'TABS') {
      console.log('Found TABS component:', key, component);
      // Get tab children
      const tabChildren = component.children || [];
      console.log('Tab children:', tabChildren);

      tabChildren.forEach(tabId => {
        const tabComponent = positionData[tabId];
        console.log(`Checking tab ${tabId}:`, tabComponent);

        if (tabComponent && tabComponent.type === 'TAB') {
          const tabName = tabComponent.meta?.text || 'Untitled Tab';
          const chartIds = extractChartIdsFromComponent(
            tabComponent,
            positionData,
          );

          console.log(`Tab "${tabName}" has chart IDs:`, chartIds);

          categories.push({
            key: tabId,
            label: tabName,
            chartIds,
          });
        }
      });
    }
  });

  console.log('Final extracted categories:', categories);
  return categories;
}

// Recursively extract chart IDs from a component and its children
function extractChartIdsFromComponent(
  component: DashboardLayout[string],
  layout: DashboardLayout,
): number[] {
  const chartIds: number[] = [];

  if (component.type === 'CHART') {
    // Try different possible fields for chart ID
    const meta = component.meta as any;
    const sliceId = meta?.chartId || meta?.sliceId || meta?.slice_id;

    console.log('Found CHART component with meta:', meta, 'extracted sliceId:', sliceId);

    if (sliceId) {
      chartIds.push(sliceId);
    }
  }

  // Recursively check children
  if (component.children) {
    component.children.forEach(childId => {
      const childComponent = layout[childId];
      if (childComponent) {
        chartIds.push(...extractChartIdsFromComponent(childComponent, layout));
      }
    });
  }

  return chartIds;
}

export default function DashboardContentArea({
  selectedDashboard,
}: DashboardContentAreaProps) {
  console.log('DashboardContentArea rendered with dashboard:', selectedDashboard);

  const [activeCategory, setActiveCategory] = useState('all');
  const [allCharts, setAllCharts] = useState<ChartItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  console.log('Current state - categories:', categories, 'activeCategory:', activeCategory);

  useEffect(() => {
    if (!selectedDashboard) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      console.log('=== FETCHING DASHBOARD DATA ===');
      console.log('Selected dashboard:', selectedDashboard);

      // Reset state when switching dashboards
      setLoading(true);
      setAllCharts([]);
      setCategories(DEFAULT_CATEGORIES);
      setActiveCategory('all');
      try {
        // Fetch dashboard details including position_json
        const dashboardResponse = await SupersetClient.get({
          endpoint: `/api/v1/dashboard/${selectedDashboard.id}`,
        });

        const dashboardData = dashboardResponse.json.result;
        console.log('Full dashboard data:', dashboardData);

        const positionData = dashboardData.position_json || {};
        console.log('Position data type:', typeof positionData);
        console.log('Position data is string?', typeof positionData === 'string');

        // If position_json is a string, parse it
        let parsedPositionData = positionData;
        if (typeof positionData === 'string') {
          console.log('Parsing position_json string...');
          parsedPositionData = JSON.parse(positionData);
        }

        console.log('Dashboard position data (parsed):', parsedPositionData);

        // Extract tabs and their charts from position_json
        const extractedCategories = extractTabsFromLayout(parsedPositionData);

        console.log('Extracted categories from dashboard:', extractedCategories);

        if (extractedCategories.length > 0) {
          setCategories(extractedCategories);
          setActiveCategory(extractedCategories[0].key);
        } else {
          // No tabs found, use default single category with all charts
          console.log('No tabs found in dashboard, using default "All Charts" category');
          setCategories(DEFAULT_CATEGORIES);
          setActiveCategory('all');
        }

        // Fetch all charts for this dashboard
        const chartsResponse = await SupersetClient.get({
          endpoint: `/api/v1/chart/?q=${JSON.stringify({
            filters: [
              {
                col: 'dashboards',
                opr: 'dashboard_is',
                value: selectedDashboard.id,
              },
            ],
            page: 0,
            page_size: 1000,
          })}`,
        });

        const charts = chartsResponse.json.result || [];
        setAllCharts(charts);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setAllCharts([]);
        setCategories(DEFAULT_CATEGORIES);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [selectedDashboard?.id]);

  // Filter charts by active category
  const getChartsForCategory = (categoryKey: string): ChartItem[] => {
    const currentCategory = categories.find(cat => cat.key === categoryKey);

    // If it's the default "all" category or no chart IDs specified, show all charts
    if (categoryKey === 'all' || !currentCategory || currentCategory.chartIds.length === 0) {
      return allCharts;
    }

    // Filter charts based on the tab's chart IDs
    return allCharts.filter(chart => currentCategory.chartIds.includes(chart.id));
  };

  const allChartsForCategory = getChartsForCategory(activeCategory);
  // Show first 5 charts as preview
  const charts = allChartsForCategory.slice(0, 5);
  const hasMoreCharts = allChartsForCategory.length > 5;

  console.log('Rendering charts for category:', activeCategory);
  console.log('All charts for this category:', allChartsForCategory);
  console.log('Charts to display (first 5):', charts);

  const handleViewDashboard = () => {
    window.location.href = selectedDashboard.url;
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <EmptyStateContainer>
          <Spin size="large" />
        </EmptyStateContainer>
      );
    }

    if (charts.length === 0) {
      return (
        <EmptyStateContainer>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                {t('No charts in this category yet.')}
              </span>
            }
          />
        </EmptyStateContainer>
      );
    }

    return (
      <>
        <ChartGrid>
          {charts.map((chart: ChartItem) => (
            <ChartPreviewContainer key={chart.id}>
              <iframe
                src={`/superset/explore/?standalone=1&slice_id=${chart.id}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title={chart.slice_name}
              />
            </ChartPreviewContainer>
          ))}
        </ChartGrid>

        {hasMoreCharts && (
          <ViewMoreButton
            type="primary"
            size="large"
            icon={<Icons.DashboardOutlined />}
            onClick={handleViewDashboard}
          >
            {t('View Full Dashboard')} ({allChartsForCategory.length} {t('charts')})
          </ViewMoreButton>
        )}
      </>
    );
  };

  const tabItems = categories.map(category => ({
    key: category.key,
    label: category.label,
    children: renderTabContent(),
  }));

  if (!selectedDashboard) {
    return (
      <ContentContainer>
        <EmptyStateContainer>
          <Spin size="large" tip={t('Loading dashboard...')} />
        </EmptyStateContainer>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <ContentHeader>
        <h2>{selectedDashboard.dashboard_title}</h2>
        <p>
          {t('Explore charts organized by category')}
        </p>
      </ContentHeader>

      <StyledTabs
        activeKey={activeCategory}
        onChange={setActiveCategory}
        items={tabItems}
      />
    </ContentContainer>
  );
}
