import React from 'react';
import css from '../lib/css';

export const Styles = () => {
  return (
    <style>
      {css`
        * {
          font-family: Inter, Helvetica, Segoe UI, Arial, sans-serif !important;
        }

        .text-small {
          font-size: 10px;
        }

        .text-light {
          font-weight: 300;
        }

        .text-gray {
          color: var(--theme-tertiary-text);
        }

        .text-error {
          color: var(--theme-error-message);
        }

        .text-success {
          color: var(--aha-green-700);
        }

        .text-strong {
          font-weight: 600;
        }

        .tab-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacer-5);
        }

        .tab-header-left {
          display: flex;
          gap: var(--spacer-4);
        }

        .tab-header-right {
          display: flex;
          gap: var(--spacer-2);
        }

        .test-row {
          display: flex;
          align-items: flex-start;
          padding: var(--spacer-2) var(--spacer-2) var(--spacer-2)
            var(--spacer-3);
          border: var(--Common--border);
          border-top: none;
          justify-content: space-between;
        }

        .test-row:first-child {
          border-top: var(--Common--border);
        }

        .test-row-column {
          display: flex;
          gap: var(--spacer-3);
          align-items: center;
          line-height: var(--line-height-t-050);
        }

        .test-ref {
          align-self: flex-start;
        }

        .test-title {
          font-size: var(--font-size-100);
          font-weight: 500;
        }

        .spinner {
          display: flex;
          gap: 0.5rem;
          padding-top: var(--spacer-1);
          padding-left: var(--spacer-5);
        }

        .sections {
          background-color: var(--theme-secondary-background);
          display: flex;
          padding: var(--spacer-4);
          gap: var(--spacer-5);
          flex-wrap: wrap;
          justify-content: space-between;
        }

        .sections section {
          background: var(--theme-primary-background);
          border: var(--Common--border);
          box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.08);
          border-radius: var(--Common--border-radius);
          display: flex;
          flex-direction: column;
          width: 800px;
        }

        .sections h2 {
          border-bottom: var(--Common--border);
          padding: var(--spacer-4) var(--spacer-5);
          margin: 0;

          font-style: normal;
          font-weight: 600;
          font-size: 18px;
          line-height: 18px;
          color: var(--theme-primary-text);
        }

        .sections .subsection {
          padding: var(--spacer-5) var(--spacer-6);
          display: flex;
          flex-direction: row;
          gap: var(--spacer-5);
          align-items: center;
        }

        .sections h3 {
          font-style: normal;
          font-weight: 600;
          font-size: 18px;
          line-height: 21px;
        }

        .id-form {
          display: flex;
          gap: var(--spacer-2);
          align-items: start;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-4);
        }

        .search-form {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-6);
          padding-top: var(--spacer-2);
        }

        .search-section {
          display: flex;
          flex-direction: column;
          border-radius: var(--Common--border-radius);
          border: var(--Common--border);
          background-color: var(--theme-secondary-background);
        }

        .search-input {
          padding: var(--spacer-2) var(--spacer-1);
        }

        .search-input input {
          color: var(--theme-secondary-text);
          background-color: var(--theme-primary-background);
        }

        .search-result-container {
          height: 250px;
          overflow-y: auto;
          border-top: var(--Common--border);
          padding: var(--spacer-1);
          background-color: var(--theme-primary-background);
        }

        .search-row {
          padding: var(--spacer-1) var(--spacer-2);
          min-height: 24px;
          display: flex;
          align-items: center;
        }

        .search-row:hover:not(:has(.search-header)) {
          background-color: var(--theme-secondary-background);
        }

        .search-row.selected {
          background-color: var(--theme-blue-background);
        }

        .search-header {
          line-height: var(--line-height-t-050);
          font-weight: 600;
        }

        .search-sub-header {
          font-weight: 500;
        }

        .search-result {
          padding-left: var(--spacer-4);
          display: flex;
          justify-content: space-between;
          flex-grow: 1;
        }

        .search-selected {
          color: var(--theme-link-text);
        }

        .search-column {
          display: flex;
          gap: var(--spacer-2);
        }

        .search-text {
          display: flex;
          gap: 4px;
        }

        .form-loading {
          display: flex;
          gap: var(--spacer-2);
          padding-bottom: var(--spacer-3);
        }

        .sync-progress {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-2);
          flex-grow: 1;
        }

        .search-footer {
          display: flex;
          align-items: center;
          gap: var(--spacer-2);
          border-top: var(--Common--border);
          padding: var(--spacer-3) var(--spacer-4);
        }

        .sync-message {
          display: flex;
          gap: var(--spacer-1);
        }

        .sync-bar {
          --aha-progress-bar--bar: var(--theme-link-text);
          --Common--border-radius: 30px;
        }

        .left-align-input {
          --aha-field--label-width: inherit;
        }
      `}
    </style>
  );
};
