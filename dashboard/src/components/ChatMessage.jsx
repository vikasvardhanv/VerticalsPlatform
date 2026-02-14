import ReactMarkdown from 'react-markdown';

function isTableSeparator(line) {
  const clean = String(line || '').trim();
  if (!clean.includes('|') || !clean.includes('-')) return false;
  const stripped = clean.replace(/\|/g, '').replace(/:/g, '').replace(/-/g, '').replace(/\s/g, '');
  return stripped.length === 0;
}

function parseTableRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseBlocks(content) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let textBuffer = [];
  let index = 0;

  const flushText = () => {
    const text = textBuffer.join('\n').trim();
    if (text) {
      blocks.push({ type: 'markdown', content: text });
    }
    textBuffer = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1];

    if (line?.includes('|') && isTableSeparator(next)) {
      flushText();

      const tableLines = [line, next];
      index += 2;

      while (index < lines.length) {
        const tableLine = lines[index];
        if (!tableLine?.includes('|') || !tableLine.trim()) {
          break;
        }
        tableLines.push(tableLine);
        index += 1;
      }

      const header = parseTableRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseTableRow).filter((row) => row.some(Boolean));

      if (header.length > 0 && bodyRows.length > 0) {
        blocks.push({ type: 'table', header, rows: bodyRows });
      }
      continue;
    }

    textBuffer.push(line);
    index += 1;
  }

  flushText();
  return blocks;
}

function AssistantContent({ content }) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        block.type === 'table' ? (
          <div key={`table-${i}`} className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {block.header.map((cell, j) => (
                    <th key={`th-${i}-${j}`} className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {block.rows.map((row, rowIndex) => (
                  <tr key={`tr-${i}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`td-${i}-${rowIndex}-${cellIndex}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {cell || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ReactMarkdown key={`md-${i}`}>{block.content}</ReactMarkdown>
        )
      ))}
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-primary-100' : isError ? 'bg-red-100' : 'bg-gray-100'
        }`}>
        {isUser ? '👤' : isError ? '⚠️' : '🤖'}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isUser
          ? 'bg-primary-600 text-white'
          : isError
            ? 'bg-red-50 text-red-800 border border-red-200'
            : 'bg-gray-100 text-gray-800'
        }`}>
        <div className="prose prose-sm max-w-none">
          {isUser || isError ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <AssistantContent content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
