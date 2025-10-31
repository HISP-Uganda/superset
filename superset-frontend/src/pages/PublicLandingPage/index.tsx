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
import { Button, Typography } from '@superset-ui/core/components';
import logoImage from 'src/assets/images/loog.jpg';

const { Title, Text } = Typography;

// Styled Components
const PageContainer = styled.div`
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  overflow-y: auto;
`;

const Header = styled.header`
  background: white;
  padding: 16px 32px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const LogoImage = styled.img`
  height: 50px;
  width: auto;
  object-fit: contain;
`;

const LogoText = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #1890ff;
`;

const Content = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 24px;
  padding: 24px;
  width: 100%;
`;

const Footer = styled.footer`
  background: white;
  padding: 32px;
  border-top: 1px solid #e8e8e8;
  text-align: center;
  margin-top: auto;
`;

const FooterContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const FooterTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 8px;
`;

const FooterText = styled.div`
  font-size: 14px;
  color: #8c8c8c;
  margin-bottom: 4px;
`;

const EmptyStateContainer = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 300px);
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 4rem;
`;

const DashboardCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
`;

const DashboardHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  background: white;
`;

const DashboardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #262626;
`;

const DashboardContent = styled.div`
  height: 400px;
  position: relative;
  background: white;
  overflow: hidden;
`;

interface Dashboard {
  id: number;
  dashboard_title: string;
  url: string;
  thumbnail_url?: string;
  changed_on_delta_humanized?: string;
}

export default function PublicLandingPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Fetch current user info
    SupersetClient.get({ endpoint: '/api/v1/me/' })
      .then(({ json }) => {
        setCurrentUser(json.result);
      })
      .catch(() => {
        setCurrentUser(null);
      });

    // Fetch public dashboards
    SupersetClient.get({
      endpoint: '/api/v1/dashboard/',
    })
      .then(({ json }) => {
        setDashboards(json.result || []);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching dashboards:', error);
        setLoading(false);
      });
  }, []);

  const handleLogin = () => {
    // Check if user is authenticated
    if (currentUser && !currentUser.isAnonymous) {
      // If logged in, go to dashboard home
      window.location.href = '/superset/welcome/';
    } else {
      // If not logged in, go to login page
      window.location.href = '/login/';
    }
  };

  const handleViewDashboard = (dashboardId: number) => {
    window.location.href = `/superset/dashboard/${dashboardId}/`;
  };

  return (
    <PageContainer>
      <Header>
        <LogoContainer>
          <LogoImage src={logoImage} alt="Uganda Ministry of Health" />
          <LogoText>Uganda Malaria Data Repository</LogoText>
        </LogoContainer>
        <Button type="primary" onClick={handleLogin}>
          {currentUser && !currentUser.isAnonymous ? 'Go to Dashboard' : 'Login'}
        </Button>
      </Header>

      <Content>
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '4rem',
            color: '#8c8c8c'
          }}>
            Loading dashboards...
          </div>
        ) : dashboards.length > 0 ? (
          dashboards.map(dashboard => (
            <DashboardCard
              key={dashboard.id}
              onClick={() => handleViewDashboard(dashboard.id)}
            >
              <DashboardHeader>
                <DashboardTitle>{dashboard.dashboard_title}</DashboardTitle>
              </DashboardHeader>
              <DashboardContent>
                {dashboard.thumbnail_url ? (
                  <img
                    src={dashboard.thumbnail_url}
                    alt={dashboard.dashboard_title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    fontSize: '48px',
                    fontWeight: 'bold'
                  }}>
                    {dashboard.dashboard_title.charAt(0).toUpperCase()}
                  </div>
                )}
              </DashboardContent>
            </DashboardCard>
          ))
        ) : (
          <EmptyStateContainer>
            <Title level={2} style={{ color: '#262626', marginBottom: '1rem' }}>
              {t('No Public Dashboards Available')}
            </Title>
            <Text style={{ color: '#8c8c8c', fontSize: '16px', display: 'block', marginBottom: '2rem' }}>
              {currentUser && !currentUser.isAnonymous
                ? t('Contact your administrator to make dashboards public.')
                : t('Login to access dashboards or contact your administrator.')}
            </Text>
            {(!currentUser || currentUser.isAnonymous) && (
              <Button type="primary" size="large" onClick={handleLogin}>
                Login Now
              </Button>
            )}
          </EmptyStateContainer>
        )}
      </Content>

      <Footer>
        <FooterContent>
          <FooterTitle>Uganda Malaria Data Repository</FooterTitle>
          <FooterText>Ministry of Health, Uganda</FooterText>
          <FooterText>National Malaria Control Division</FooterText>
          <FooterText style={{ marginTop: '16px' }}>
            Contact: <a href="mailto:info@health.go.ug" style={{ color: '#1890ff' }}>info@health.go.ug</a>
          </FooterText>
          <FooterText style={{ marginTop: '8px', fontSize: '12px' }}>
            © 2025 Ministry of Health Uganda. All rights reserved.
          </FooterText>
        </FooterContent>
      </Footer>
    </PageContainer>
  );
}
