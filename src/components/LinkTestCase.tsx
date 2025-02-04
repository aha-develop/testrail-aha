import React, { useRef, useState } from 'react';
import { IDENTIFIER } from '../extension';

type Props = {
  id: string;
  typename: string;
  setOpen: (open: boolean) => void;
  setSpinner: (spinner: boolean) => void;
  setSpinnerKey: (string) => void;
};

const LinkTestCase: React.FC<Props> = ({
  id,
  typename,
  setOpen,
  setSpinner,
  setSpinnerKey,
}) => {
  const [validation, setValidation] = useState(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    const caseId = inputRef.current?.value;

    if (!caseId) {
      setValidation('Please enter a Test Case ID');
      return;
    }

    if (!/^\d+$/.test(caseId)) {
      setValidation('Test Case ID must be a valid number');
      return;
    }

    setValidation(null);

    aha.triggerServer(`${IDENTIFIER}.linkTestCase`, { id, typename, caseId });
    setSpinnerKey(`linkTestCase-${caseId}`);
    setSpinner(true);
    setOpen(false);
  };

  return (
    <aha-modal open position='center' size='medium'>
      <aha-modal-header modalTitle='Link Test Case' />
      <aha-modal-body>
        <aha-field required={true}>
          <div slot='label'>Test Case ID</div>
          <input
            ref={inputRef}
            type='number'
            placeholder='Enter a Test Case ID without the "C" e.g. 123'
          />
          {validation && <div slot='error'>{validation}</div>}
        </aha-field>
      </aha-modal-body>
      <aha-modal-footer>
        <aha-button kind='secondary' onClick={() => setOpen(false)}>
          Cancel
        </aha-button>
        <aha-button kind='primary' onClick={handleButtonClick}>
          Submit
        </aha-button>
      </aha-modal-footer>
    </aha-modal>
  );
};

export default LinkTestCase;
