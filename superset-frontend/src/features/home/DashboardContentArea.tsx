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
    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
    gap: ${theme.sizeUnit * 6}px;
    margin-bottom: ${theme.sizeUnit * 6}px;
    margin-top: ${theme.sizeUnit * 4}px;

    @media (max-width: 1400px) {
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    }

    @media (max-width: 1200px) {
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    }

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  `}
`;

const ChartCard = styled(Card)`
  ${({ theme }) => `
    cursor: pointer;
    transition: all 0.3s ease;
    border: 1px solid ${theme.colorBorderSecondary};
    height: 100%;
    min-height: 380px;

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
      border-color: ${theme.colorPrimary};
    }

    .ant-card-cover {
      height: 280px;
      background: ${theme.colorBgLayout};
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid ${theme.colorBorderSecondary};
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .anticon {
        font-size: 80px !important;
      }
    }

    .ant-card-body {
      padding: ${theme.sizeUnit * 5}px ${theme.sizeUnit * 4}px;
    }

    .ant-card-meta-title {
      font-size: 16px;
      font-weight: 600;
      color: ${theme.colorText};
      margin-bottom: ${theme.sizeUnit * 2}px;
      line-height: 1.4;
    }

    .ant-card-meta-description {
      font-size: 14px;
      color: ${theme.colorTextSecondary};
      line-height: 1.5;
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

const categories: Category[] = [
  { key: 'analysis', label: 'Analysis / Dashboards' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'exports', label: 'Data Exports' },
  { key: 'indicators', label: 'Indicators' },
  { key: 'reports', label: 'Reports' },
];

export default function DashboardContentArea({
  selectedDashboard,
}: DashboardContentAreaProps) {
  const [activeCategory, setActiveCategory] = useState('analysis');
  const [allCharts, setAllCharts] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedDashboard) {
      setLoading(false);
      return;
    }

    const fetchCharts = async () => {
      setLoading(true);
      try {
        // Fetch all charts and filter by dashboard
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
        console.error('Error fetching dashboard charts:', error);
        setAllCharts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCharts();
  }, [selectedDashboard?.id]);

  // Filter charts by active category based on tags
  const getChartsForCategory = (categoryKey: string): ChartItem[] => {
    // For 'analysis' category, show ALL charts regardless of tags
    if (categoryKey === 'analysis') {
      return allCharts;
    }

    // For other categories, only show charts with matching tags
    return allCharts.filter(chart => {
      const hasMatchingTag = chart.tags?.some(
        tag => tag.name === `category:${categoryKey}`,
      );
      return hasMatchingTag;
    });
  };

  const allChartsForCategory = getChartsForCategory(activeCategory);
  // Show only first 2 charts as preview
  const charts = allChartsForCategory.slice(0, 2);
  const hasMoreCharts = allChartsForCategory.length > 2;

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
