import React, { useState, useRef } from 'react';
import { debounce } from 'lodash';
import { formatTime } from '../../lib/util';

export type TreeNode = {
  value: string;
  text: string;
  date?: number;
  children?: TreeNode[];
};

type CommonProps = {
  selected: string[];
  showReference?: boolean;
  referencePrefix?: string;
};

type Props = CommonProps & {
  selected: string[];
  tree: TreeNode[];
  onSelect: (value: string) => Promise<void>;
  recordName: string;
  loading: boolean;
  placeholder: string;
  label: string;
};

type SectionProps = CommonProps & {
  tree: TreeNode;
  query: string;
  key: string;
  onSelectBuilder: (value: string) => () => Promise<void>;
  nesting?: number;
};

const ResultSection: React.FC<SectionProps> = ({
  tree,
  query,
  selected,
  key,
  onSelectBuilder,
  showReference = true,
  referencePrefix,
  nesting = 0,
}) => {
  let filtered = tree.children;

  const matchesQuery = (node: TreeNode): boolean => {
    const queryText = showReference
      ? `${referencePrefix}${node.value}${node.text}`
      : node.text;

    return (
      node.children?.some(child => matchesQuery(child)) ||
      queryText.toLowerCase().includes(query.trim().toLowerCase())
    );
  };

  if (query.length > 0) {
    filtered = filtered.filter(matchesQuery);
  }

  if (filtered.length === 0) return null;

  const style = { paddingLeft: `${nesting * 20}px` };

  return (
    <>
      {nesting === 0 && (
        <div key={key} className='search-row' style={style}>
          <div className='search-header'>{tree.text}</div>
        </div>
      )}
      {filtered.map(node => (
        <>
          <div
            key={node.value}
            className={`search-row${
              selected.includes(node.value) ? ' selected' : ''
            }`}
            style={style}
            onClick={onSelectBuilder(node.value)}
          >
            <div className='search-result'>
              <div className='search-column'>
                {selected.includes(node.value) ? (
                  <aha-icon class='search-selected' icon='fa-solid fa-check' />
                ) : (
                  <aha-icon icon='fa-regular fa-square' />
                )}

                <div className='search-text'>
                  {showReference && (
                    <div className='text-light text-gray'>{`${referencePrefix}${node.value}`}</div>
                  )}

                  <div className={node.children ? 'search-sub-header' : null}>
                    {node.text}
                  </div>
                </div>
              </div>
              {node.date && (
                <div className='text-light text-gray'>
                  {formatTime(node.date)}
                </div>
              )}
            </div>
          </div>
          {node.children && (
            <ResultSection
              tree={node}
              query={query}
              selected={selected}
              key={node.value}
              onSelectBuilder={onSelectBuilder}
              showReference={showReference}
              referencePrefix={referencePrefix}
              nesting={nesting + 1}
            />
          )}
        </>
      ))}
    </>
  );
};

const SearchByName: React.FC<Props> = ({
  selected,
  tree,
  onSelect,
  children,
  recordName,
  showReference = true,
  referencePrefix,
  loading,
  placeholder,
  label,
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
    };

  return (
    <>
      <div className='search-label'>
        {label}
        <span className='label-required'>*</span>
      </div>
      <div className='search-section'>
        <div className='search-input'>
          <input
            style={{ width: '300px', margin: '0' }}
            ref={inputRef}
            type='text'
            placeholder={`Search by ${recordName} name`}
            onInput={search}
          />
        </div>
        <div className='search-result-container'>
          {loading ? (
            <aha-loading-row class='search-loader' rows={5} columns={2} />
          ) : tree.length === 0 ? (
            <div className='search-placeholder'>{placeholder}</div>
          ) : (
            tree.map(header => (
              <ResultSection
                tree={header}
                query={query}
                selected={selected}
                key={header.value}
                onSelectBuilder={onSelectBuilder}
                showReference={showReference}
                referencePrefix={referencePrefix}
              />
            ))
          )}
        </div>
        {children && <div className='search-footer'>{children}</div>}
      </div>
    </>
  );
};

export default SearchByName;
