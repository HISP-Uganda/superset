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

import { DHIS2Parameters } from './types';

/**
 * Generate DHIS2 SQL comment from parameters
 */
export function generateDHIS2Comment(params: DHIS2Parameters): string {
  const parts: string[] = [];

  // Dimension: dx (data elements)
  if (params.dataElements.length > 0) {
    const dxStr = params.dataElements.join(';');
    parts.push(`dimension=dx:${dxStr}`);
  }

  // Dimension: pe (periods)
  if (params.periods.length > 0) {
    const peStr = params.periods.join(';');
    parts.push(`dimension=pe:${peStr}`);
  }

  // Dimension: ou (org units)
  if (params.orgUnits.length > 0) {
    const ouStr = params.orgUnits.join(';');
    parts.push(`dimension=ou:${ouStr}`);
  }

  // Additional parameters
  parts.push(`displayProperty=${params.displayProperty}`);
  parts.push(`skipMeta=${params.skipMeta}`);

  const commentBody = parts.join('&');

  return `/* DHIS2: ${commentBody} */`;
}

/**
 * Generate complete DHIS2 SQL query
 */
export function generateDHIS2SQL(
  params: DHIS2Parameters,
  endpoint: string = 'analytics',
): string {
  const comment = generateDHIS2Comment(params);

  return `SELECT * FROM ${endpoint}\n${comment}`;
}

/**
 * Validate DHIS2 parameters
 */
export function validateParameters(params: DHIS2Parameters): string[] {
  const errors: string[] = [];

  if (params.dataElements.length === 0) {
    errors.push('At least one data element is required');
  }

  if (params.periods.length === 0) {
    errors.push('At least one period is required');
  }

  if (params.orgUnits.length === 0) {
    errors.push('At least one org unit is required');
  }

  return errors;
}

/**
 * Parse DHIS2 comment from SQL to extract parameters
 */
export function parseDHIS2Comment(sql: string): DHIS2Parameters | null {
  const commentMatch = sql.match(/\/\*\s*DHIS2:\s*(.+?)\s*\*\//i);

  if (!commentMatch) {
    return null;
  }

  const paramsStr = commentMatch[1];
  const params: DHIS2Parameters = {
    dataElements: [],
    periods: [],
    orgUnits: [],
    displayProperty: 'NAME',
    skipMeta: false,
  };

  // Parse parameter string
  const paramPairs = paramsStr.split('&');
  paramPairs.forEach(pair => {
    const [key, value] = pair.split('=');
    const trimmedKey = key.trim();
    const trimmedValue = value?.trim() || '';

    if (trimmedKey === 'dimension') {
      const [dimType, dimValues] = trimmedValue.split(':');
      const values = dimValues?.split(';') || [];

      if (dimType === 'dx') {
        params.dataElements = values;
      } else if (dimType === 'pe') {
        params.periods = values;
      } else if (dimType === 'ou') {
        params.orgUnits = values;
      }
    } else if (trimmedKey === 'displayProperty') {
      params.displayProperty = trimmedValue as any;
    } else if (trimmedKey === 'skipMeta') {
      params.skipMeta = trimmedValue === 'true';
    }
  });

  return params;
}
