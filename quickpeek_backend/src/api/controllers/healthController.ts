import { Request, Response } from 'express';
import redisClient from '../../core/config/redis';

export const checkHealth = async (req: Request, res: Response) => {
  res.status(200).send('Server is running...');
};

export const checkCacheHealth = async (req: Request, res: Response) => {
  const { userId } = req.query;
  const cacheKey = `userRating:${userId}`;
  const cachedRating = await redisClient.get(cacheKey);
  console.log(cachedRating);
  if (cachedRating) {
    return res.status(200).json({
      message: "result found",
      data: JSON.parse(cachedRating)
    });
  }

  return res.status(200).json({
    message: "no result found in cache",
    data: {}
  });
};
