import moment from 'moment';

const MAX_LENGTH = 100;

export const timeAgo: (timestamp: number | null) => string = timestamp => {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
};

export const truncate: (text: string) => string = text => {
  if (!text) return text;

  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '...' : text;
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
