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
          color: #666666;
        }

        .text-error {
          color: #c9250e;
        }

        .text-strong {
          font-weight: bold;
        }

        .tab-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .tab-header-left {
          display: flex;
          gap: 11px;
          align-items: baseline;
        }

        .tab-header-right {
          display: flex;
          gap: 7px;
          align-items: baseline;
        }

        .tab-title {
          line-height: 20px;
          color: #333333;
        }

        .test-row {
          display: flex;
          align-items: center;
          padding: 8px 6px 8px 12px;
          border: 1px solid #e1e1e1;
          border-top: none;
          justify-content: space-between;
        }

        .test-row:first-child {
          border-top: 1px solid #e1e1e1;
        }

        .test-row-column {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .test-title {
          font-size: 14px;
          font-weight: 500;
        }

        .test-comment {
          font-size: 12px;
          color: #666666;
        }

        .spinner {
          display: flex;
          gap: 0.5rem;
          padding-top: 5px;
          padding-left: 20px;
        }

        .sections {
          background-color: var(--theme-secondary-background);
          display: flex;
          padding: 16px;
          gap: 18px;
          flex-wrap: wrap;
          justify-content: space-between;
        }

        .sections section {
          background: var(--theme-primary-background);
          border: 1px solid var(--theme-primary-border);
          box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.08);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          width: 800px;
        }

        .sections h2 {
          border-bottom: 1px solid var(--theme-primary-border);
          padding: 15px 21px;
          margin: 0;

          font-style: normal;
          font-weight: 600;
          font-size: 18px;
          line-height: 18px;
          color: var(--theme-primary-text);
        }

        .sections .subsection {
          padding: 21px 26px;
          display: flex;
          flex-direction: row;
          gap: 20px;
          align-items: center;
        }

        .sections h3 {
          font-style: normal;
          font-weight: bold;
          font-size: 18px;
          line-height: 21px;
        }

        .id-form {
          display: flex;
          gap: 0.5rem;
          align-items: start;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .search-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-top: 10px;
        }

        .search-section {
          display: flex;
          flex-direction: column;
          border-radius: 4px;
          border: 1px solid #e1e1e1;
          background-color: #f7f7f7;
        }

        .search-input {
          padding: 8px 6px;
        }

        .search-results {
          height: 250px;
          overflow-y: auto;
          border-top: 1px solid #e1e1e1;
          padding: 6px 5px;
        }

        .search-row {
          padding: 4px 6px;
          min-height: 24px;
          font-size: 12px;
        }

        .search-header {
          line-height: 20px;
          font-size: 12px;
          font-weight: bold;
        }

        .search-result {
          padding-left: 15px;
          line-height: 16px;
          display: flex;
          gap: 10px;
        }

        .search-text {
          display: flex;
          gap: 4px;
        }

        .search-ref {
          font-weight: 300;
          color: #666666;
        }

        .form-loading {
          display: flex;
          gap: 0.5rem;
          padding-bottom: 10px;
        }

        .sync-progress {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .search-footer {
          border-top: 1px solid #e1e1e1;
          padding: 12px 15px;
        }

        .sync-message {
          display: flex;
          gap: 4px;
        }

        .sync-bar {
          --aha-progress-bar--bar: #0073cf;
          --aha-progress-bar--background: var(--aha-gray-300);
          --Common--border-radius: 30px;
        }
      `}
    </style>
  );
};
