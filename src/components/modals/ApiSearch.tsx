import React, { Fragment, useCallback, useMemo, useState, useRef } from 'react';
import { debounce } from 'lodash';
import { formatTime } from '../../lib/util';
import { IDENTIFIER, TestRailRecord } from '../../extension';
import { fieldName } from '../../lib/extensionFields/queries';

export type TreeNode = {
  value: string;
  text: string;
  date?: number;
  children?: TreeNode[];
  header?: boolean;
  meta?: any;
};

type CommonProps = {
  selected: string[];
  linkedIds: number[];
  showReference?: boolean;
  referencePrefix?: string;
};

type Props = CommonProps & {
  selected: string[];
  searchIds: number[];
  searchKind: TestRailRecord['kind'];
  searchKey: string;
  buildTree: (
    fields: Aha.ExtensionField[],
    referenceMatches?: number[]
  ) => Promise<TreeNode[]>;
  onSelect: (value: string, isSelected: boolean, meta: any) => Promise<void>;
  recordName: string;
  loading: boolean;
  placeholder: string;
  label: string;
};

type SectionProps = CommonProps & {
  tree: TreeNode;
  query: string;
  key: string;
  onSelectBuilder: (
    value: string,
    isSelected: boolean,
    meta: any
  ) => () => Promise<void>;
  nesting?: number;
};

const ResultSection: React.FC<SectionProps> = ({
  tree,
  query,
  selected,
  linkedIds,
  key,
  onSelectBuilder,
  showReference = true,
  referencePrefix,
  nesting = 0,
}) => {
  if (tree.children.length === 0) return null;

  const style = { paddingLeft: `${nesting * 20}px` };

  return (
    <>
      {(nesting === 0 || tree.header) && (
        <div key={key} className='search-row' style={style}>
          <div className='search-header'>{tree.text}</div>
        </div>
      )}
      {tree.children.map(node => {
        const isSelected = selected.includes(node.value);
        const isLinked = linkedIds.includes(Number.parseInt(node.value));

        const checked = isSelected || isLinked;

        let onClick: () => void;

        if (isLinked) {
          onClick = () => {}; // Linked items cannot be toggled
        } else {
          onClick = onSelectBuilder(node.value, !checked, node.meta);
        }

        const searchClass =
          'search-row' +
          (checked ? ' selected' : '') +
          (isLinked ? ' disabled' : '');

        return (
          <Fragment key={node.value}>
            {!node.header && (
              <div
                key={node.value}
                className={searchClass}
                style={style}
                onClick={onClick}
              >
                <div className='search-result'>
                  <div className='search-column'>
                    {checked ? (
                      <aha-icon
                        class='search-selected'
                        icon='fa-solid fa-check'
                      />
                    ) : (
                      <aha-icon icon='fa-regular fa-square' />
                    )}

                    <div className='search-text'>
                      {showReference && (
                        <div className='text-light text-gray'>{`${referencePrefix}${node.value}`}</div>
                      )}

                      <div
                        className={node.children ? 'search-sub-header' : null}
                      >
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
            )}
            {node.children && (
              <ResultSection
                tree={node}
                query={query}
                selected={selected}
                linkedIds={linkedIds}
                key={node.value}
                onSelectBuilder={onSelectBuilder}
                showReference={showReference}
                referencePrefix={referencePrefix}
                nesting={nesting + 1}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
};

const ApiSearch: React.FC<Props> = ({
  selected,
  searchIds,
  linkedIds,
  searchKind,
  searchKey,
  onSelect,
  buildTree,
  children,
  recordName,
  showReference = true,
  referencePrefix,
  loading,
  placeholder,
  label,
}) => {
  const [query, setQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<TreeNode[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchNames = useMemo(
    () => searchIds.map(id => fieldName(searchKind, id)),
    [searchIds]
  );

  const search = useCallback(
    debounce(async () => {
      if (inputRef.current === null) return;

      const query = inputRef.current.value || '';
      setQuery(() => query);

      if (query.trim().length === 0 || searchNames.length === 0) {
        setSearchResults([]);
        return;
      }

      const results = await aha.account.searchExtensionFields(
        IDENTIFIER,
        searchNames,
        searchKey,
        query
      );

      let referenceMatches = [];

      if (showReference) {
        const fixedQuery = query.trim().toUpperCase();
        referenceMatches = searchIds
          .map(id => `${referencePrefix}${id}`)
          .filter(reference => reference.includes(fixedQuery));
      }

      const resultNodes = await buildTree(results, referenceMatches);

      setSearchResults(() => resultNodes);
    }, 250),
    [searchNames, showReference, buildTree]
  );

  const onSelectBuilder: (
    value: string,
    isSelected: boolean,
    meta: any
  ) => () => Promise<void> = useCallback(
    (value, isSelected, meta) => async () => {
      await onSelect(value, isSelected, meta);
    },
    [onSelect]
  );

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
          ) : query.trim() === '' ? (
            <div className='search-placeholder'>
              Start searching to show results
            </div>
          ) : searchResults.length === 0 ? (
            <div className='search-placeholder'>{placeholder}</div>
          ) : (
            searchResults.map(header => (
              <ResultSection
                tree={header}
                query={query}
                selected={selected}
                linkedIds={linkedIds}
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

export default ApiSearch;
