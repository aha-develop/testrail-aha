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
          color: #666666;
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
          font-size: 12px;
          display: flex;
          justify-content: center;
        }

        .error {
          color: #c9250e;
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
      `}
    </style>
  );
};
