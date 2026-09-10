const KEY = 'stockaroo-queue';

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
};

const write = (queue) => localStorage.setItem(KEY, JSON.stringify(queue));

export const queueSize = () => read().length;

export const enqueue = (payload) => {
  const queue = read();
  queue.push({ ...payload, queued_at: new Date().toISOString() });
  write(queue);
  return queue.length;
};

// Drains in order; a failed send stops the drain so ordering is preserved.
export const flush = async (send) => {
  let queue = read();
  let sent = 0;

  while (queue.length) {
    try {
      await send(queue[0]);
    } catch (err) {
      if (err.offline) break;
      // Permanently rejected (e.g. renamed away, bad payload): drop it.
    }
    queue = read().slice(1);
    write(queue);
    sent += 1;
  }

  return { sent, remaining: queue.length };
};
