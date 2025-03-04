import React, { useEffect, useState, useRef } from 'react';
import { ExtensionRecord } from '../../lib/extensionRecord';
import LinkByIdForm from './LinkByIdForm';
import LinkByNameForm from './LinkByNameForm';
import { BulkSyncState } from '../../lib/sync/bulkSync';

type Props = {
  domain: string;
  record: ExtensionRecord;
  syncData: BulkSyncState;
  onClose: (event: any) => void;
};

const LinkTestCase: React.FC<Props> = ({
  domain,
  record,
  syncData,
  onClose,
}) => {
  const [useId, setUseId] = useState(true);
  const modalRef = useRef(null);

  let cachedUseId = useId;

  const toggleForm = (value: boolean) => {
    setUseId(value);
    cachedUseId = value;
  };

  useEffect(() => {
    const modal = modalRef.current;
    modal.addEventListener('aha-modal:close', onClose);

    return () => {
      modal.removeEventListener('aha-modal:close', onClose);
    };
  }, [onClose]);

  return (
    <aha-modal ref={modalRef} open position='h-center' size='medium'>
      <aha-modal-header modalTitle='Link test case'>
        Link test case
      </aha-modal-header>
      <aha-modal-body>
        <div className='modal-form'>
          <aha-radio-button-group>
            <aha-radio-button
              selected={cachedUseId}
              onClick={() => toggleForm(true)}
            >
              By test case ID
            </aha-radio-button>
            <aha-radio-button
              selected={!cachedUseId}
              onClick={() => toggleForm(false)}
            >
              By name
            </aha-radio-button>
          </aha-radio-button-group>
          <div style={{ display: cachedUseId ? 'block' : 'none' }}>
            <LinkByIdForm domain={domain} record={record} />
          </div>
          <div style={{ display: cachedUseId ? 'none' : 'block' }}>
            <LinkByNameForm record={record} syncData={syncData} />
          </div>
        </div>
      </aha-modal-body>
    </aha-modal>
  );
};

export default LinkTestCase;
