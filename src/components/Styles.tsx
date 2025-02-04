import React from 'react';
import css from '../lib/css';

export const Styles = () => {
  return (
    <style>
      {css`
        * {
          font-family: Inter, Helvetica, Segoe UI, Arial, sans-serif !important;
        }

        .text-light {
          color: #666666;
          font-size: 10px;
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

        .spinner-error {
          color: #c9250e;
        }
      `}
    </style>
  );
};
