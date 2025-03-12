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

        .has-pointer {
          cursor: pointer;
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

        .sync-background {
          padding-top: var(--spacer-5);
          background-color: var(--theme-secondary-background);
        }

        .sync-page {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-4);
          margin-left: auto;
          margin-right: auto;
          max-width: 900px;
          width: 100%;
        }

        .sync-panel {
          background-color: var(--theme-primary-background);
          border: var(--Common--border);
          border-radius: var(--Common--border-radius);
        }

        .sync-panel-header {
          border-bottom: var(--Common--border);
          padding: var(--spacer-5);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sync-panel-content {
          padding: var(--spacer-5);
        }

        .sync-panel-row {
          display: flex;
          border-top: var(--Common--border);
          height: 42px;
          align-items: center;
        }

        .sync-panel-top-row {
          display: flex;
          align-items: flex-end;
          padding-bottom: var(--spacer-1);
        }

        .sync-panel-column {
          display: flex;
          gap: var(--spacer-4);
          width: 50%;
          align-items: center;
        }

        .sync-time-ago {
          color: var(--theme-secondary-text);
          width: 30%;
        }

        .sync-panel-bulk {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-4);
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
          gap: var(--spacer-4);
        }

        .search-section {
          display: flex;
          flex-direction: column;
          border-radius: var(--Common--border-radius);
          border: var(--Common--border);
          background-color: var(--theme-secondary-background);
        }

        .search-label {
          font-size: var(--font-size-100);
          font-weight: 500;
        }

        .label-required {
          color: var(--theme-button-danger);
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
          cursor: pointer;
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

        .search-placeholder {
          padding: var(--spacer-4);
          font-size: var(--font-size-100);
          font-weight: 300;
          color: var(--theme-tertiary-text);
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

        .run-rows {
          display: flex;
          flex-direction: column;
          gap: var(--spacer-3);
        }

        .run-row {
          border: var(--Common--border);
          padding: var(--spacer-4) var(--spacer-3);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .run-row-column {
          display: flex;
          align-items: center;
          gap: var(--spacer-2);
        }

        .run-rows .test-row {
          background-color: var(--theme-secondary-background);
        }

        .run-title {
          font-weight: 500;
          font-size: var(--font-size-100);
        }

        .run-stat-row {
          display: flex;
          gap: var(--spacer-2);
        }

        .status-count {
          display: flex;
          gap: var(--spacer);
        }

        .test-status {
          min-width: 62px;
          text-align: center;
        }
      `}
    </style>
  );
};
