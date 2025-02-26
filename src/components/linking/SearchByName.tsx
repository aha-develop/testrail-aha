import React, { useState, useRef } from 'react';
import { debounce } from 'lodash';

export type TreeHeader = {
  value: string;
  text: string;
  children: TreeNode[];
};

type TreeNode = {
  value: string;
  text: string;
};

type Props = {
  selected: string[];
  setSelected: (selected: string[]) => void;
  tree: TreeHeader[];
  onSelect: (value: string) => Promise<void>;
  recordName: string;
};

type SectionProps = {
  header: TreeHeader;
  query: string;
  selected: string[];
  key: string;
  onSelectBuilder: (value: string) => () => Promise<void>;
};

const ResultSection: React.FC<SectionProps> = ({
  header,
  query,
  selected,
  key,
  onSelectBuilder,
}) => {
  let filtered = header.children;

  if (query.length > 0) {
    filtered = filtered.filter(c =>
      c.text.toLowerCase().includes(query.toLowerCase())
    );
  }

  if (filtered.length === 0) return null;

  return (
    <>
      <div key={key} className='search-row'>
        <div className='search-header'>{header.text}</div>
      </div>
      {filtered.map(node => (
        <div key={node.value} className='search-row'>
          <div className='search-result'>
            {selected.includes(node.value) ? (
              <input type='checkbox' checked disabled />
            ) : (
              <input type='checkbox' onChange={onSelectBuilder(node.value)} />
            )}
            <div className='search-text'>
              <div className='search-ref'>{`C${node.value}`}</div>
              {node.text}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

const SearchByName: React.FC<Props> = ({
  selected,
  setSelected,
  tree,
  onSelect,
  children,
  recordName,
}) => {
  const [query, setQuery] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const search = debounce(async () => {
    if (inputRef.current === null) return;

    const query = inputRef.current.value || '';
    setQuery(query);
  }, 250);

  const onSelectBuilder: (value: string) => () => Promise<void> =
    value => async () => {
      await onSelect(value);
      setSelected([...selected, value]);
    };

  return (
    <div class='search-section'>
      <div class='search-input'>
        <input
          style={{ width: '300px', margin: '0' }}
          ref={inputRef}
          type='text'
          placeholder={`Search by ${recordName} name`}
          onInput={search}
        />
      </div>
      <div className='search-results'>
        {tree.map(header => (
          <ResultSection
            header={header}
            query={query}
            selected={selected}
            key={header.value}
            onSelectBuilder={onSelectBuilder}
          />
        ))}
      </div>
      <div className='search-footer'>{children}</div>
    </div>
  );
};

export default SearchByName;
