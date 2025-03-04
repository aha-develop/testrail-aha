import moment from 'moment';

export const timeAgo: (timestamp: number | null) => string = timestamp => {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
};

export const sleep: (timeout: number) => Promise<void> = timeout =>
  new Promise(resolve => setTimeout(resolve, timeout));
