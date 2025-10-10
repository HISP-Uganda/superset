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

import { SupersetClient, JsonValue } from '@superset-ui/core';
import { Dataset } from '@superset-ui/chart-controls';
import { AsyncVerify, ControlPropsWithExtras } from './withAsyncVerification';

/**
 * Utility to extract current form fields from form data
 */
export function collectQueryFields(formData: any): {
  dimensions: string[];
  metrics: string[];
} {
  const dimensions: string[] = [];
  const metrics: string[] = [];

  // Extract dimensions from various field types
  if (formData.groupby) {
    dimensions.push(
      ...(Array.isArray(formData.groupby)
        ? formData.groupby
        : [formData.groupby]),
    );
  }
  if (formData.columns) {
    dimensions.push(
      ...(Array.isArray(formData.columns)
        ? formData.columns
        : [formData.columns]),
    );
  }
  if (formData.all_columns) {
    dimensions.push(
      ...(Array.isArray(formData.all_columns)
        ? formData.all_columns
        : [formData.all_columns]),
    );
  }
  if (formData.series_columns) {
    dimensions.push(
      ...(Array.isArray(formData.series_columns)
        ? formData.series_columns
        : [formData.series_columns]),
    );
  }
  if (formData.series) {
    dimensions.push(
      ...(Array.isArray(formData.series) ? formData.series : [formData.series]),
    );
  }
  if (formData.entity) {
    dimensions.push(
      ...(Array.isArray(formData.entity) ? formData.entity : [formData.entity]),
    );
  }
  if (formData.x_axis) {
    dimensions.push(
      ...(Array.isArray(formData.x_axis) ? formData.x_axis : [formData.x_axis]),
    );
  }

  // Extract metrics from various field types
  if (formData.metrics) {
    metrics.push(
      ...(Array.isArray(formData.metrics)
        ? formData.metrics
        : [formData.metrics]),
    );
  }
  if (formData.metric) {
    metrics.push(formData.metric);
  }
  if (formData.metric_2) {
    metrics.push(formData.metric_2);
  }
  if (formData.percent_metrics) {
    metrics.push(
      ...(Array.isArray(formData.percent_metrics)
        ? formData.percent_metrics
        : [formData.percent_metrics]),
    );
  }
  if (formData.timeseries_limit_metric) {
    metrics.push(formData.timeseries_limit_metric);
  }
  if (formData.x) {
    metrics.push(formData.x);
  }
  if (formData.y) {
    metrics.push(formData.y);
  }
  if (formData.size) {
    metrics.push(formData.size);
  }
  if (formData.secondary_metric) {
    metrics.push(formData.secondary_metric);
  }

  // Filter out null/undefined values and convert objects to strings if needed
  const cleanDimensions = dimensions
    .filter(dim => dim != null)
    .map(dim =>
      typeof dim === 'string' ? dim : (dim as any)?.column_name || String(dim),
    );

  const cleanMetrics = metrics
    .filter(metric => metric != null)
    .map(metric =>
      typeof metric === 'string'
        ? metric
        : (metric as any)?.metric_name || String(metric),
    );

  const result = {
    dimensions: [...new Set(cleanDimensions)], // Remove duplicates
    metrics: [...new Set(cleanMetrics)], // Remove duplicates
  };

  return result;
}

/**
 * Check if a datasource supports semantic layer verification
 */
function supportsSemanticLayerVerification(datasource: Dataset): boolean {
  if (!datasource || !('database' in datasource) || !datasource.database) {
    return false;
  }

  const database = datasource.database as any;
  return Boolean(database.engine_information?.supports_dynamic_columns);
}

// Cache for API calls to prevent duplicates
const apiCallCache = new Map<
  string,
  Promise<{ dimensions: string[]; metrics: string[] } | null>
>();

// Request debouncing - keyed by datasource + control combination
const pendingRequests = new Map<string, Promise<any>>();
const lastRequestTime = new Map<string, number>();

// Track which controls have had their initial verification
const initialVerificationDone = new Set<string>();

/**
 * Create verification result from API response
 */
function createVerificationResult(
  validationResult: { dimensions: string[]; metrics: string[] },
  savedMetrics: any[],
  props: ControlPropsWithExtras,
  controlName?: string,
) {
  const { datasource, actions } = props;

  // Filter saved metrics to only include valid ones
  const validMetricNames = new Set(validationResult.metrics);
  const filteredSavedMetrics = savedMetrics.filter((metric: any) =>
    validMetricNames.has(metric.metric_name || metric),
  );

  // Mark datasource metrics and columns as disabled if invalid (for left panel)
  const dataset = datasource as Dataset;
  let updatedDatasourceMetrics = dataset.metrics;
  let updatedDatasourceColumns = dataset.columns;

  // Filter valid names to only include those that exist in the original datasource
  const originalDimensionNames = new Set(
    dataset.columns?.map((col: any) => col.column_name) || [],
  );
  const originalMetricNames = new Set(
    dataset.metrics?.map((metric: any) => metric.metric_name) || [],
  );

  const filteredValidMetricNames = new Set(
    validationResult.metrics.filter(metric => originalMetricNames.has(metric)),
  );
  const filteredValidDimensionNames = new Set(
    validationResult.dimensions.filter(dim => originalDimensionNames.has(dim)),
  );

  if (dataset.metrics) {
    updatedDatasourceMetrics = dataset.metrics.map((metric: any) => ({
      ...metric,
      isDisabled: !filteredValidMetricNames.has(metric.metric_name || metric),
    }));
  }

  // Also update columns using the same validation result
  if (dataset.columns) {
    updatedDatasourceColumns = dataset.columns.map((column: any) => ({
      ...column,
      isDisabled: !filteredValidDimensionNames.has(
        column.column_name || column,
      ),
    }));
  }

  // Create updated datasource for left panel
  const updatedDatasource = {
    ...dataset,
    metrics: updatedDatasourceMetrics,
    columns: updatedDatasourceColumns,
  };

  // Update the Redux store's datasource to affect the left panel
  if (actions && typeof actions.syncDatasourceMetadata === 'function') {
    actions.syncDatasourceMetadata(updatedDatasource);
  }

  return {
    savedMetrics: filteredSavedMetrics,
    datasource: updatedDatasource,
  };
}

/**
 * Call the validation API
 */
export async function callValidationAPI(
  datasource: Dataset,
  selectedDimensions: string[],
  selectedMetrics: string[],
  controlName?: string,
): Promise<{ dimensions: string[]; metrics: string[] } | null> {
  const databaseId = (datasource.database as any)?.id;
  if (!datasource?.id || !databaseId) {
    return null;
  }

  // Create cache key based on the request parameters
  const cacheKey = JSON.stringify({
    datasource_id: datasource.id,
    dimensions: selectedDimensions.sort(),
    metrics: selectedMetrics.sort(),
  });

  // Create a key for this specific control to prevent duplicate requests
  const controlKey = `${datasource.id}_${controlName || 'unknown'}`;
  const now = Date.now();

  // Check if we already have a pending request for the same parameters
  if (apiCallCache.has(cacheKey)) {
    console.log(`[API] Reusing cached request for control: ${controlName}`);
    return apiCallCache.get(cacheKey)!;
  }

  // Check if we have a pending request for this specific control
  if (pendingRequests.has(controlKey)) {
    console.log(
      `[API] Request already pending for control: ${controlName}, waiting...`,
    );
    return pendingRequests.get(controlKey)!;
  }

  // Enhanced deduplication: check if we have an identical request in flight
  const requestSignature = `${datasource.id}_${selectedDimensions.join(',')}_${selectedMetrics.join(',')}`;

  // If we have an identical request already cached, return it
  if (apiCallCache.has(requestSignature)) {
    console.log(
      `[API] Identical request found for control: ${controlName}, reusing...`,
    );
    return apiCallCache.get(requestSignature)!;
  }

  // Time-based deduplication: if we just made a request for this control, wait a bit
  const lastTime = lastRequestTime.get(controlKey) || 0;
  if (now - lastTime < 50) {
    // 50ms debounce
    console.log(
      `[API] Request too soon for control: ${controlName}, debouncing...`,
    );
    return new Promise(resolve => {
      setTimeout(async () => {
        // Try again after debounce
        const result = await callValidationAPI(
          datasource,
          selectedDimensions,
          selectedMetrics,
          controlName,
        );
        resolve(result);
      }, 50);
    });
  }

  lastRequestTime.set(controlKey, now);

  try {
    console.log(`[API] Making request for control: ${controlName}`, {
      datasource_id: datasource.id,
      dimensions: selectedDimensions,
      metrics: selectedMetrics,
    });

    const apiPromise = SupersetClient.post({
      endpoint: `/api/v1/database/${databaseId}/valid_metrics_and_dimensions/`,
      jsonPayload: {
        datasource_id: datasource.id,
        dimensions: selectedDimensions,
        metrics: selectedMetrics,
      },
    }).then(
      response => response.json as { dimensions: string[]; metrics: string[] },
    );

    // Cache the promise for the exact same parameters
    apiCallCache.set(cacheKey, apiPromise);

    // Cache by request signature for identical requests
    apiCallCache.set(requestSignature, apiPromise);

    // Also track this request for this specific control
    pendingRequests.set(controlKey, apiPromise);

    // Clean up on completion
    const result = await apiPromise;
    apiCallCache.delete(cacheKey);
    apiCallCache.delete(requestSignature);
    pendingRequests.delete(controlKey);
    console.log(`[API] Request completed for control: ${controlName}`, result);

    return result;
  } catch (error) {
    // Clean up on error
    apiCallCache.delete(cacheKey);
    apiCallCache.delete(requestSignature);
    pendingRequests.delete(controlKey);

    console.warn('Failed to fetch valid metrics and dimensions:', error);
    return null;
  }
}

/**
 * Create verification function for metrics controls
 */
export function createMetricsVerification(controlName?: string): AsyncVerify {
  return async (props: ControlPropsWithExtras) => {
    const { datasource, form_data, savedMetrics = [], value } = props;

    // Only verify for semantic layer datasources
    if (!supportsSemanticLayerVerification(datasource as Dataset)) {
      return null;
    }

    console.log(`[MetricsVerification] Triggered for control: ${controlName}`, {
      datasource: datasource?.id,
      form_data,
      value,
      savedMetrics: savedMetrics.length,
      stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n'),
    });

    // Create form data with the current value for this control
    const syntheticFormData = { ...form_data };
    if (controlName) {
      syntheticFormData[controlName] = value;
    }

    // Extract query fields using the complete form data approach
    const queryFields = collectQueryFields(syntheticFormData);

    console.log(`[MetricsVerification] Query fields:`, queryFields);
    console.log(`[MetricsVerification] Form data:`, form_data);
    console.log(
      `[MetricsVerification] Synthetic form data:`,
      syntheticFormData,
    );

    // If no metrics or dimensions are selected, enable all options
    if (
      queryFields.dimensions.length === 0 &&
      queryFields.metrics.length === 0
    ) {
      console.log(`[MetricsVerification] No selections, enabling all options`);
      const dataset = datasource as Dataset;

      // Enable all metrics
      const updatedDatasourceMetrics = dataset.metrics?.map((metric: any) => ({
        ...metric,
        isDisabled: false,
      }));

      // Enable all columns
      const updatedDatasourceColumns = dataset.columns?.map((column: any) => ({
        ...column,
        isDisabled: false,
      }));

      const updatedDatasource = {
        ...dataset,
        metrics: updatedDatasourceMetrics,
        columns: updatedDatasourceColumns,
      };

      // Update Redux store
      if (
        props.actions &&
        typeof props.actions.syncDatasourceMetadata === 'function'
      ) {
        props.actions.syncDatasourceMetadata(updatedDatasource);
      }

      return {
        savedMetrics,
        datasource: updatedDatasource,
      };
    }

    const validationResult = await callValidationAPI(
      datasource as Dataset,
      queryFields.dimensions,
      queryFields.metrics,
      controlName,
    );

    if (!validationResult) {
      return null;
    }

    return createVerificationResult(
      validationResult,
      savedMetrics,
      props,
      controlName,
    );
  };
}

/**
 * Create verification function for dimensions controls
 */
export function createColumnsVerification(controlName?: string): AsyncVerify {
  return async (props: ControlPropsWithExtras) => {
    const { datasource, form_data, options = [], actions, value } = props;

    // Only verify for semantic layer datasources
    if (!supportsSemanticLayerVerification(datasource as Dataset)) {
      return null;
    }

    // Handle initial verification for fresh charts
    const { triggerInitialVerification } = props as any;
    const datasourceControlKey = `${datasource?.id}_${controlName}`;

    if (
      triggerInitialVerification &&
      !initialVerificationDone.has(datasourceControlKey)
    ) {
      console.log(
        `[ColumnsVerification] Triggering initial verification for control: ${controlName}`,
      );
      initialVerificationDone.add(datasourceControlKey);

      // Trigger initial verification with empty form data
      const initialResult = await callValidationAPI(
        datasource as Dataset,
        [],
        [],
        controlName,
      );

      if (initialResult) {
        // Mark all options as enabled/disabled based on initial result
        const validDimensionNames = new Set(initialResult.dimensions);
        const updatedOptions = options.map((option: any) => ({
          ...option,
          isDisabled: !validDimensionNames.has(option.column_name || option),
        }));

        // Update left panel disabled states
        const verificationResult = createVerificationResult(
          initialResult,
          [],
          props,
          controlName,
        );

        return {
          options: updatedOptions,
          datasource: verificationResult.datasource,
        };
      }
    }

    console.log(`[ColumnsVerification] Triggered for control: ${controlName}`, {
      datasource: datasource?.id,
      form_data,
      value,
      options: options.length,
      stackTrace: new Error().stack?.split('\n').slice(1, 6).join('\n'),
    });

    // Create form data with the current value
    const syntheticFormData = { ...form_data };
    if (controlName) {
      syntheticFormData[controlName] = value;
    }

    // Extract query fields using the complete form data approach
    const queryFields = collectQueryFields(syntheticFormData);

    console.log(`[ColumnsVerification] Query fields:`, queryFields);
    console.log(`[ColumnsVerification] Form data:`, form_data);
    console.log(
      `[ColumnsVerification] Synthetic form data:`,
      syntheticFormData,
    );

    // If no metrics or dimensions are selected, enable all options
    if (
      queryFields.dimensions.length === 0 &&
      queryFields.metrics.length === 0
    ) {
      console.log(`[ColumnsVerification] No selections, enabling all options`);
      const dataset = datasource as Dataset;

      // Enable all options
      const updatedOptions = options.map((option: any) => ({
        ...option,
        isDisabled: false,
      }));

      // Enable all metrics
      const updatedDatasourceMetrics = dataset.metrics?.map((metric: any) => ({
        ...metric,
        isDisabled: false,
      }));

      // Enable all columns
      const updatedDatasourceColumns = dataset.columns?.map((column: any) => ({
        ...column,
        isDisabled: false,
      }));

      const updatedDatasource = {
        ...dataset,
        metrics: updatedDatasourceMetrics,
        columns: updatedDatasourceColumns,
      };

      // Update Redux store
      if (actions && typeof actions.syncDatasourceMetadata === 'function') {
        actions.syncDatasourceMetadata(updatedDatasource);
      }

      return {
        options: updatedOptions,
        datasource: updatedDatasource,
      };
    }

    const validationResult = await callValidationAPI(
      datasource as Dataset,
      queryFields.dimensions,
      queryFields.metrics,
      controlName,
    );

    if (!validationResult) {
      return null;
    }

    // Mark dimension options as disabled if invalid
    const validDimensionNames = new Set(validationResult.dimensions);
    const updatedOptions = options.map((option: any) => ({
      ...option,
      isDisabled: !validDimensionNames.has(option.column_name || option),
    }));

    // Use createVerificationResult helper for consistent processing
    const verificationResult = createVerificationResult(
      validationResult,
      [], // savedMetrics not used for columns verification
      props,
      controlName,
    );

    return {
      options: updatedOptions,
      datasource: verificationResult.datasource,
    };
  };
}

/**
 * Create onChange handler that triggers re-rendering of other controls when values change
 */
export function createSemanticLayerOnChange(
  controlName: string,
  affectedControls: string[],
) {
  return (value: JsonValue, props: ControlPropsWithExtras) => {
    const { actions, form_data } = props;

    // Delay re-verification to allow Redux state to propagate first
    // This prevents race conditions where other controls verify with stale form_data
    setTimeout(() => {
      // Trigger re-rendering of affected controls by updating their values
      // This forces the verification to run again
      affectedControls.forEach(controlField => {
        if (
          controlField !== controlName &&
          form_data &&
          form_data[controlField]
        ) {
          actions.setControlValue(controlField, form_data[controlField], []);
        }
      });
    }, 0);
  };
}

/**
 * Get list of control fields that should trigger re-rendering
 */
export const SEMANTIC_LAYER_CONTROL_FIELDS = [
  // Metric controls
  'metrics',
  'metric',
  'metric_2',
  'percent_metrics',
  'timeseries_limit_metric',
  'x',
  'y',
  'size',
  'secondary_metric',

  // Dimension controls
  'groupby',
  'columns',
  'all_columns',
  'series_columns',
  'series',
  'entity',
  'x_axis',
];
