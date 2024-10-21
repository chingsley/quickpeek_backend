export const delayInSeconds = (timeout: number) =>
  new Promise((res) => {
    setTimeout(() => {
      res(null);
    }, timeout * 1000);
  });