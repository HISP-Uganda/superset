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

export interface DHIS2Parameters {
  dataElements: string[]; // UIDs
  periods: string[]; // Period codes or dates
  orgUnits: string[]; // UIDs
  displayProperty: 'NAME' | 'SHORT_NAME' | 'CODE';
  skipMeta: boolean;
}

export interface DHIS2DataElement {
  id: string;
  displayName: string;
}

export interface DHIS2Period {
  id: string;
  name: string;
}

export interface DHIS2OrgUnit {
  id: string;
  displayName: string;
  level?: number;
}

export const RELATIVE_PERIODS = [
  { id: 'THIS_YEAR', name: 'This Year' },
  { id: 'LAST_YEAR', name: 'Last Year' },
  { id: 'THIS_QUARTER', name: 'This Quarter' },
  { id: 'LAST_QUARTER', name: 'Last Quarter' },
  { id: 'THIS_MONTH', name: 'This Month' },
  { id: 'LAST_MONTH', name: 'Last Month' },
  { id: 'THIS_WEEK', name: 'This Week' },
  { id: 'LAST_WEEK', name: 'Last Week' },
  { id: 'LAST_3_MONTHS', name: 'Last 3 Months' },
  { id: 'LAST_6_MONTHS', name: 'Last 6 Months' },
  { id: 'LAST_12_MONTHS', name: 'Last 12 Months' },
];

export const ORG_UNIT_SPECIAL_CODES = [
  { id: 'USER_ORGUNIT', name: 'My Org Unit' },
  { id: 'USER_ORGUNIT_CHILDREN', name: 'My Org Unit + Children' },
  { id: 'USER_ORGUNIT_GRANDCHILDREN', name: 'My Org Unit + Grandchildren' },
];
