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
import { styled, css } from '@superset-ui/core';
import { debounce } from 'lodash';
import { getUrlParam } from 'src/utils/urlUtils';
import { MainNav, MenuMode } from '@superset-ui/core/components/Menu';
import { Tooltip, Grid, Row, Col } from '@superset-ui/core/components';
import { NavLink, useLocation } from 'react-router-dom';
import { Icons } from '@superset-ui/core/components/Icons';
import { Typography } from '@superset-ui/core/components/Typography';
import { useUiConfig } from 'src/components/UiConfigContext';
import { URL_PARAMS } from 'src/constants';
import {
  MenuObjectChildProps,
  MenuObjectProps,
  MenuData,
} from 'src/types/bootstrapTypes';
import RightMenu from './RightMenu';

interface MenuProps {
  data: MenuData;
  isFrontendRoute?: (path?: string) => boolean;
}

const StyledHeader = styled.header`
  ${({ theme }) => `
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      border-bottom: 1px solid ${theme.colorBorderSecondary};
      z-index: 10;

      &:nth-last-of-type(2) nav {
        margin-bottom: 2px;
      }
      .caret {
        display: none;
      }
      & .ant-image{
        display: contents;
        height: 100%;
        padding: ${theme.sizeUnit}px
          ${theme.sizeUnit * 2}px
          ${theme.sizeUnit}px
          ${theme.sizeUnit * 4}px;
      }
      .navbar-brand {
        display: flex;
        flex-direction: column;
        justify-content: center;
        /* must be exactly the height of the Antd navbar */
        min-height: 50px;
        padding: ${theme.sizeUnit}px
          ${theme.sizeUnit * 2}px
          ${theme.sizeUnit}px
          ${theme.sizeUnit * 4}px;
        max-width: ${theme.sizeUnit * theme.brandIconMaxWidth}px;
        img {
          height: 100%;
          object-fit: contain;
        }
        &:focus {
          border-color: transparent;
        }
        &:focus-visible {
          border-color: ${theme.colorPrimaryText};
        }
      }
      .navbar-brand-text {
        height: 100%;
        color: #ffffff;
        padding-left: ${theme.sizeUnit * 6}px;
        padding-right: ${theme.sizeUnit * 8}px;
        margin-right: ${theme.sizeUnit * 4}px;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.3px;
        float: left;
        display: flex;
        flex-direction: column;
        justify-content: center;

        span {
          white-space: nowrap;
        }
        @media (max-width: 1127px) {
          font-size: 16px;
          padding-left: ${theme.sizeUnit * 3}px;
          padding-right: ${theme.sizeUnit * 3}px;
        }
      }
      @media (max-width: 767px) {
        .navbar-brand {
          float: none;
        }
      }
      .main-nav {
        background: transparent;
        border-bottom: none;

        .ant-menu-item {
          color: rgba(255, 255, 255, 0.95);
          font-weight: 500;

          a {
            color: rgba(255, 255, 255, 0.95);
          }

          &:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.1);

            a {
              color: #ffffff;
            }
          }

          &.ant-menu-item-selected {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.15);

            a {
              color: #ffffff;
            }
          }
        }
      }

      @media (max-width: 767px) {
        .ant-menu-item {
          padding: 0 ${theme.sizeUnit * 6}px 0
            ${theme.sizeUnit * 3}px !important;
        }
        .ant-menu > .ant-menu-item > span > a {
          padding: 0px;
        }
        .main-nav .ant-menu-submenu-title > svg:nth-of-type(1) {
          display: none;
        }
      }
  `}
`;
const { SubMenu } = MainNav;

const StyledSubMenu = styled(SubMenu)`
  ${({ theme }) => css`
    [data-icon="caret-down"] {
      color: rgba(255, 255, 255, 0.8);
      font-size: ${theme.fontSizeXS}px;
      margin-left: ${theme.sizeUnit}px;
    }
    &.ant-menu-submenu {
        padding: ${theme.sizeUnit * 2}px ${theme.sizeUnit * 4}px;
        display: flex;
        align-items: center;
        height: 100%;

        .ant-menu-title-content {
          color: rgba(255, 255, 255, 0.95);
          font-weight: 500;
        }

        &:hover .ant-menu-title-content {
          color: #ffffff;
        }

        &.ant-menu-submenu-active {
          .ant-menu-title-content {
            color: #ffffff;
          }
        }
    }
  `}
`;
const { useBreakpoint } = Grid;

export function Menu({
  data: {
    menu,
    brand,
    navbar_right: navbarRight,
    settings,
    environment_tag: environmentTag,
  },
  isFrontendRoute = () => false,
}: MenuProps) {
  const [showMenu, setMenu] = useState<MenuMode>('horizontal');
  const screens = useBreakpoint();
  const uiConfig = useUiConfig();

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= 767) {
        setMenu('inline');
      } else setMenu('horizontal');
    }
    handleResize();
    const windowResize = debounce(() => handleResize(), 10);
    window.addEventListener('resize', windowResize);
    return () => window.removeEventListener('resize', windowResize);
  }, []);

  enum Paths {
    Home = '/superset/welcome',
    Explore = '/explore',
    Dashboard = '/dashboard',
    Chart = '/chart',
    Datasets = '/tablemodelview',
  }

  const defaultTabSelection: string[] = [];
  const [activeTabs, setActiveTabs] = useState(defaultTabSelection);
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    switch (true) {
      case path.startsWith(Paths.Home):
        setActiveTabs(['Home']);
        break;
      case path.startsWith(Paths.Dashboard):
        setActiveTabs(['Dashboards']);
        break;
      case path.startsWith(Paths.Chart) || path.startsWith(Paths.Explore):
        setActiveTabs(['Charts']);
        break;
      case path.startsWith(Paths.Datasets):
        setActiveTabs(['Datasets']);
        break;
      default:
        setActiveTabs(defaultTabSelection);
    }
  }, [location.pathname]);

  const standalone = getUrlParam(URL_PARAMS.standalone);
  if (standalone || uiConfig.hideNav) return <></>;

  const renderSubMenu = ({
    label,
    childs,
    url,
    index,
    isFrontendRoute,
  }: MenuObjectProps) => {
    if (url && isFrontendRoute) {
      return (
        <MainNav.Item key={label} role="presentation">
          <NavLink role="button" to={url} activeClassName="is-active">
            {label}
          </NavLink>
        </MainNav.Item>
      );
    }
    if (url) {
      return (
        <MainNav.Item key={label}>
          <Typography.Link href={url}>{label}</Typography.Link>
        </MainNav.Item>
      );
    }
    return (
      <StyledSubMenu
        key={index}
        title={label}
        icon={
          showMenu === 'inline' ? (
            <></>
          ) : (
            <Icons.CaretDownOutlined iconSize="xs" />
          )
        }
      >
        {childs?.map((child: MenuObjectChildProps | string, index1: number) => {
          if (typeof child === 'string' && child === '-' && label !== 'Data') {
            return <MainNav.Divider key={`$${index1}`} />;
          }
          if (typeof child !== 'string') {
            return (
              <MainNav.Item key={`${child.label}`}>
                {child.isFrontendRoute ? (
                  <NavLink
                    to={child.url || ''}
                    exact
                    activeClassName="is-active"
                  >
                    {child.label}
                  </NavLink>
                ) : (
                  <Typography.Link href={child.url}>
                    {child.label}
                  </Typography.Link>
                )}
              </MainNav.Item>
            );
          }
          return null;
        })}
      </StyledSubMenu>
    );
  };
  const renderBrand = () => {
    // Hide logo - only show text title
    return null;
  };
  return (
    <StyledHeader className="top" id="main-menu" role="navigation">
      <Row>
        <Col md={16} xs={24} style={{ display: 'flex' }}>
          <Tooltip
            id="brand-tooltip"
            placement="bottomLeft"
            title={brand.tooltip}
            arrow={{ pointAtCenter: true }}
          >
            {renderBrand()}
          </Tooltip>
          {brand.text && (
            <div className="navbar-brand-text">
              <span>{brand.text}</span>
            </div>
          )}
          <MainNav
            mode={showMenu}
            data-test="navbar-top"
            className="main-nav"
            selectedKeys={activeTabs}
            disabledOverflow
          >
            {menu.map((item, index) => {
              const props = {
                index,
                ...item,
                isFrontendRoute: isFrontendRoute(item.url),
                childs: item.childs?.map(c => {
                  if (typeof c === 'string') {
                    return c;
                  }

                  return {
                    ...c,
                    isFrontendRoute: isFrontendRoute(c.url),
                  };
                }),
              };

              return renderSubMenu(props);
            })}
          </MainNav>
        </Col>
        <Col md={8} xs={24}>
          <RightMenu
            align={screens.md ? 'flex-end' : 'flex-start'}
            settings={settings}
            navbarRight={navbarRight}
            isFrontendRoute={isFrontendRoute}
            environmentTag={environmentTag}
          />
        </Col>
      </Row>
    </StyledHeader>
  );
}

// transform the menu data to reorganize components
export default function MenuWrapper({ data, ...rest }: MenuProps) {
  const newMenuData = {
    ...data,
    brand: {
      ...data.brand,
      text: 'Uganda Malaria Data Repository',
    },
  };

  // Menu items that should go into settings dropdown
  const settingsMenus = {
    Data: true,
    Security: true,
    Manage: true,
  };

  // Cycle through menu.menu to build out cleanedMenu and settings
  const cleanedMenu: MenuObjectProps[] = [];
  const settings: MenuObjectProps[] = [];
  newMenuData.menu.forEach((item: any) => {
    if (!item) {
      return;
    }

    const children: (MenuObjectProps | string)[] = [];
    const newItem = {
      ...item,
    };

    // Filter childs
    if (item.childs) {
      item.childs.forEach((child: MenuObjectChildProps | string) => {
        if (typeof child === 'string') {
          children.push(child);
        } else if ((child as MenuObjectChildProps).label) {
          children.push(child);
        }
      });

      newItem.childs = children;
    }

    if (!settingsMenus.hasOwnProperty(item.name)) {
      cleanedMenu.push(newItem);
    } else {
      settings.push(newItem);
    }
  });

  newMenuData.menu = cleanedMenu;
  newMenuData.settings = settings;

  return <Menu data={newMenuData} {...rest} />;
}
