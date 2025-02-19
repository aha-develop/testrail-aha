import moment from 'moment';

export const timeAgo: (timestamp: number | null) => string = timestamp => {
  if (!timestamp) return 'never';

  return moment(timestamp).fromNow();
};
