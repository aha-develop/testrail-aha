import moment from 'moment';

const MAX_LENGTH = 100;

export const timeAgo: (timestamp: number | null) => string = timestamp => {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
};

export const truncate: (text: string) => string = text => {
  if (!text) return text;

  // Using [...text] means we can slice by character, not by byte (still fails with zero-width separators)
  return text.length > MAX_LENGTH
    ? [...text].slice(0, MAX_LENGTH) + '...'
    : text;
};

export const formatTime: (timestamp: number) => string = timestamp =>
  moment(timestamp).format('MM/DD/YYYY');

export const sleep: (timeout: number) => Promise<void> = timeout =>
  new Promise(resolve => setTimeout(resolve, timeout));

// TestRail gives us status colors as signed longs - convert them to hex color,
// then apply some transparency (the base TestRail colors don't work well on Aha! backgrounds)
export const numberToColor: (color: number) => string = color => {
  const hex = '#' + ('000000' + (color >>> 0).toString(16)).slice(-6);

  return hex + '99'; // 60% opacity
};

// Aha! renders top-level alerts in the 'ajax-flash' div
// Set the value here to mimic core Aha! behaviour
const showMessage: (
  msg: string,
  type: 'danger' | 'warning',
  heading?: string
) => void = (msg, type, heading) => {
  const flash = `
    <aha-alert type='${type}' dismissable>
      <button type='button' slot='close'>
        <i class='fa-regular fa-times'></i>
      </button>
      ${heading ? `<div slot='heading'>${heading}</div>` : ''}
      <div>${msg}</div>
    </aha-alert>
  `;

  const noticeNode = document.querySelector('.ajax-flash');

  noticeNode.replaceChildren();
  noticeNode.insertAdjacentHTML('beforeend', flash);
};

export const showError: (msg: string) => void = msg => {
  showMessage(msg, 'danger');
};

export const showSyncWarning: () => void = () => {
  showMessage(
    'You can navigate in other tabs, but do not close this page or refresh it until the sync is finished.',
    'warning',
    'You must remain on the page while the sync completes.'
  );
};
