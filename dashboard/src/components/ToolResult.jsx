const TOOL_DETAILS = {
  'doc-extract': {
    emoji: '📄',
    label: 'Document Extraction',
    purpose: 'Pulled structured data from uploaded documents.'
  },
  'tax-categorize': {
    emoji: '🏷️',
    label: 'Tax Categorization',
    purpose: 'Mapped transactions to IRS expense categories.'
  },
  'tax-prep-automate': {
    emoji: '🧾',
    label: 'Tax Prep Automation',
    purpose: 'Prepared tax-ready categorization summaries for CPA review.'
  },
  'transaction-match': {
    emoji: '🔗',
    label: 'Transaction Matching',
    purpose: 'Matched bank entries against ledger transactions.'
  },
  'bank-recon-sync': {
    emoji: '🏦',
    label: 'Bank Reconciliation',
    purpose: 'Checked whether bank and ledger entries reconcile.'
  },
  'anomaly-detect': {
    emoji: '🚨',
    label: 'Anomaly Detection',
    purpose: 'Scanned transactions for unusual or risky activity.'
  },
  'audit-package': {
    emoji: '📦',
    label: 'Audit Package',
    purpose: 'Prepared artifacts required for audit support.'
  },
  'audit-trail-generate': {
    emoji: '🛡️',
    label: 'Audit Trail',
    purpose: 'Generated immutable audit trail entries.'
  },
  'export-to-excel': {
    emoji: '📊',
    label: 'Excel Export',
    purpose: 'Created an Excel workbook for reporting and filing.'
  }
};

const TABLE_CONFIG = {
  categorized: {
    title: 'Categorized Transactions',
    columns: ['date', 'description', 'vendor', 'amount', 'category', 'irs_line', 'deductible_amount', 'confidence']
  },
  needs_review: {
    title: 'Needs Review',
    columns: ['date', 'description', 'vendor', 'amount', 'reason', 'suggested_category', 'confidence']
  },
  matched: {
    title: 'Matched Transactions',
    columns: [
      'bank_date',
      'bank_description',
      'bank_amount',
      'bank_transaction_date',
      'bank_transaction_description',
      'bank_transaction_amount',
      'ledger_date',
      'ledger_amount',
      'ledger_entry_date',
      'ledger_entry_amount',
      'match_type',
      'confidence'
    ]
  },
  unmatched_bank: {
    title: 'Unmatched Bank Transactions',
    columns: ['date', 'description', 'amount', 'suggestion']
  },
  unmatched_ledger: {
    title: 'Unmatched Ledger Entries',
    columns: ['date', 'description', 'amount', 'suggestion']
  },
  alerts: {
    title: 'Risk Alerts',
    columns: ['type', 'severity', 'transaction_id', 'amount', 'message']
  },
  recommendations: {
    title: 'Recommendations',
    columns: ['type', 'message']
  },
  extracted_data: {
    title: 'Extracted Documents',
    columns: ['filename', 'document_id']
  }
};

function toTitle(text) {
  return String(text || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isCurrencyKey(key) {
  return /(amount|total|deductible|balance|expense|income|difference|cost)/i.test(key);
}

function isPercentKey(key) {
  return /(rate|confidence|percent|pct)/i.test(key);
}

function formatValue(value, key = '') {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    if (isPercentKey(key)) {
      if (value > 0 && value <= 1) {
        return `${Math.round(value * 100)}%`;
      }
      return `${Math.round(value)}%`;
    }

    if (isCurrencyKey(key)) {
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    return value.toLocaleString();
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    return `${Object.keys(value).length} fields`;
  }

  return String(value);
}

function flattenRow(row) {
  const flat = {};

  if (!row || typeof row !== 'object') {
    return flat;
  }

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      flat[key] = value;
      continue;
    }

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (nestedValue === null || nestedValue === undefined) {
        continue;
      }
      if (typeof nestedValue !== 'object' || Array.isArray(nestedValue)) {
        flat[`${key}_${nestedKey}`] = nestedValue;
      }
    }
  }

  return flat;
}

function buildMetricRows(output) {
  const sections = [];

  if (output.summary && typeof output.summary === 'object') {
    sections.push({ title: 'Summary', data: output.summary });
  }

  if (output.totals && typeof output.totals === 'object') {
    sections.push({ title: 'Totals', data: output.totals });
  }

  const topLevel = Object.entries(output).filter(([key, value]) => (
    !['summary', 'totals', 'categorized', 'needs_review', 'matched', 'unmatched_bank', 'unmatched_ledger', 'duplicates', 'alerts', 'recommendations', 'extracted_data', '_meta'].includes(key) &&
    (typeof value !== 'object' || value === null)
  ));

  if (topLevel.length > 0) {
    sections.push({
      title: 'Run Details',
      data: Object.fromEntries(topLevel)
    });
  }

  return sections;
}

function buildArraySections(output) {
  const sections = [];

  for (const [key, value] of Object.entries(output)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }

    const config = TABLE_CONFIG[key] || {};
    sections.push({
      key,
      title: config.title || toTitle(key),
      rows: value,
      preferredColumns: config.columns || []
    });
  }

  return sections;
}

function buildNextSteps(toolName, output) {
  const suggestions = [];

  if (toolName === 'doc-extract') {
    suggestions.push('Categorize extracted transactions for tax filing.');
  }

  if (toolName === 'tax-categorize' || toolName === 'tax-prep-automate') {
    suggestions.push('Review transactions flagged in Needs Review before final filing.');
    suggestions.push('Export categorization to Excel for client workpapers.');
  }

  if (toolName === 'bank-recon-sync' || toolName === 'transaction-match') {
    suggestions.push('Investigate unmatched transactions and post adjusting entries.');
  }

  if (toolName === 'anomaly-detect') {
    suggestions.push('Investigate high-severity alerts and document findings in the audit file.');
  }

  if (output.download_url) {
    suggestions.push('Download the generated Excel workbook and attach it to the client file.');
  }

  if (Array.isArray(output.recommendations)) {
    output.recommendations.forEach((item) => {
      if (typeof item === 'string') {
        suggestions.push(item);
      } else if (item && item.message) {
        suggestions.push(item.message);
      }
    });
  }

  if (output.needs_review?.length > 0) {
    suggestions.push(`Resolve ${output.needs_review.length} review items before sign-off.`);
  }

  if (output.unmatched_bank?.length > 0 || output.unmatched_ledger?.length > 0) {
    suggestions.push('Resolve unmatched bank and ledger entries to complete reconciliation.');
  }

  if (typeof output.risk_score === 'number' && output.risk_score >= 50) {
    suggestions.push('Risk score is elevated. Prioritize review of critical and high alerts.');
  }

  return [...new Set(suggestions)].slice(0, 4);
}

function DataTable({ title, rows, preferredColumns = [], maxRows = 8 }) {
  const flattenedRows = rows.map(flattenRow);
  const sampleRows = flattenedRows.slice(0, maxRows);

  const inferredColumns = Array.from(
    new Set(sampleRows.flatMap((row) => Object.keys(row)))
  );

  const columns = preferredColumns.length > 0
    ? preferredColumns.filter((column) => inferredColumns.includes(column))
    : inferredColumns.slice(0, 8);

  if (columns.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">{title}</h4>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                  {toTitle(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sampleRows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map((column) => (
                  <td key={`${title}-${index}-${column}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                    {formatValue(row[column], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <p className="mt-1 text-xs text-gray-500">Showing first {maxRows} of {rows.length} rows.</p>
      )}
    </div>
  );
}

function MetricTable({ title, data }) {
  const rows = Object.entries(data || {});

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">{title}</h4>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-left font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map(([key, value]) => (
              <tr key={`${title}-${key}`}>
                <td className="px-3 py-2 text-gray-700">{toTitle(key)}</td>
                <td className="px-3 py-2 text-gray-900 font-medium">{formatValue(value, key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToolResult({ result }) {
  const output = result.output || {};
  const toolDetail = TOOL_DETAILS[result.tool] || {
    emoji: '🔧',
    label: toTitle(result.tool),
    purpose: 'Completed a finance workflow step.'
  };
  const metricSections = buildMetricRows(output);
  const arraySections = buildArraySections(output);
  const nextSteps = buildNextSteps(result.tool, output);
  const isSuccess = output.success !== false;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span>{toolDetail.emoji}</span>
            <span className="font-semibold text-gray-900">{toolDetail.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isSuccess ? 'Completed' : 'Issue'}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{toolDetail.purpose}</p>
        </div>
        {output._meta?.duration_ms && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {output._meta.duration_ms} ms
          </span>
        )}
      </div>

      {output.message && (
        <p className="mt-3 text-sm text-gray-700">{output.message}</p>
      )}

      {output.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {output.error}
          {output.help && <div className="mt-1 text-red-600">{output.help}</div>}
        </div>
      )}

      {metricSections.map((section) => (
        <MetricTable key={section.title} title={section.title} data={section.data} />
      ))}

      {arraySections.map((section) => (
        <DataTable
          key={section.key}
          title={section.title}
          rows={section.rows}
          preferredColumns={section.preferredColumns}
        />
      ))}

      {output.download_url && (
        <div className="mt-3">
          <a
            href={output.download_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary-700 hover:text-primary-800 underline"
          >
            Download Export File
          </a>
        </div>
      )}

      {nextSteps.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <h4 className="text-sm font-semibold text-gray-800">Suggested Next Steps for CPA</h4>
          <ul className="mt-1 space-y-1">
            {nextSteps.map((step, index) => (
              <li key={`${result.tool}-step-${index}`} className="text-xs text-gray-700">
                • {step}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ToolResult;
