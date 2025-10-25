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

import { styled } from '@superset-ui/core';
import { Menu } from 'antd';
import { Icons } from '@superset-ui/core/components/Icons';

const StyledSidebar = styled.div`
  ${({ theme }) => `
    width: 280px;
    min-height: calc(100vh - 60px);
    background: ${theme.colorBgContainer};
    border-right: 1px solid ${theme.colorBorderSecondary};
    position: fixed;
    left: 0;
    top: 60px;
    z-index: 5;
    overflow-y: auto;
    transition: all 0.3s ease;

    @media (max-width: 768px) {
      width: 0;
      overflow: hidden;
    }
  `}
`;

const StyledMenu = styled(Menu)`
  ${({ theme }) => `
    background: transparent;
    border-right: none;
    padding: ${theme.sizeUnit * 2}px 0;

    .ant-menu-item {
      height: auto;
      line-height: 1.4;
      padding: ${theme.sizeUnit * 3}px ${theme.sizeUnit * 4}px !important;
      margin: 0;
      display: flex;
      align-items: center;
      color: ${theme.colorText};
      font-size: 14px;
      border-radius: 0;

      &:hover {
        background: ${theme.colorBgLayout};
        color: ${theme.colorPrimary};
      }

      &.ant-menu-item-selected {
        background: ${theme.colorPrimaryBg};
        color: ${theme.colorPrimary};
        font-weight: 600;
      }

      .ant-menu-item-icon {
        font-size: 18px;
        min-width: 24px;
        margin-right: ${theme.sizeUnit * 2}px;
      }
    }

    .ant-menu-item-divider {
      margin: ${theme.sizeUnit}px 0;
      background: ${theme.colorBorderSecondary};
    }
  `}
`;

const SidebarTitle = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 4}px ${theme.sizeUnit * 4}px ${theme.sizeUnit * 2}px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: ${theme.colorTextSecondary};
  `}
`;

interface DataSourceItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  url?: string;
}

const dataSourceCategories: DataSourceItem[] = [
  {
    key: 'routine-chmis',
    label: 'Routine eCHMIS Data',
    icon: <Icons.DatabaseOutlined />,
    url: '/routine-chmis',
  },
  {
    key: 'surveillance',
    label: 'Surveillance',
    icon: <Icons.EyeOutlined />,
    url: '/surveillance',
  },
  {
    key: 'case-management',
    label: 'Case Management / Prevention',
    icon: <Icons.UserOutlined />,
    url: '/case-management',
  },
  {
    key: 'meteorological',
    label: 'Meteorological / Environmental Data',
    icon: <Icons.ThunderboltOutlined />,
    url: '/meteorological',
  },
  {
    key: 'vector-control',
    label: 'Vector Control',
    icon: <Icons.BugOutlined />,
    url: '/vector-control',
  },
  {
    key: 'facility-list',
    label: 'Master Facility List',
    icon: <Icons.AppstoreOutlined />,
    url: '/facility-list',
  },
  {
    key: 'survey-data',
    label: 'Survey Data',
    icon: <Icons.FileTextOutlined />,
    url: '/survey-data',
  },
];

export default function DataSourceSidebar() {
  const handleMenuClick = ({ key }: { key: string }) => {
    const item = dataSourceCategories.find(cat => cat.key === key);
    if (item?.url) {
      window.location.href = item.url;
    }
  };

  return (
    <StyledSidebar>
      <SidebarTitle>Data Sources</SidebarTitle>
      <StyledMenu
        mode="inline"
        defaultSelectedKeys={['routine-chmis']}
        onClick={handleMenuClick}
        items={dataSourceCategories.map(item => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
        }))}
      />
    </StyledSidebar>
  );
}
