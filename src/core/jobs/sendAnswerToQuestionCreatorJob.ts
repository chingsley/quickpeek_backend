import { Question } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { sendNotification } from '../messaging/firebase.push';

type QuestionWithUser = Question & {
  user: {
    deviceToken: string;
    deviceType: string;
    notificationsEnabled: string;
  };
};

const sendAnswerToquestionCreator = async (job: Job) => {
  try {
    const { questionId, answerContent, responderId } = job.data;

    const responder = await prisma.user.findUnique({ where: { id: responderId } });
    if (!responder) throw Error(`Responder with id: ${responderId} not found`);

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      include: {
        user: {
          select: {
            deviceToken: true,
            deviceType: true,
            notificationsEnabled: true
          },
        },
      },
    }) as QuestionWithUser | null;
    if (!question || !question.user) {
      throw new Error('Question or associated user not found');
    }

    const { user } = question;
    if (!user.notificationsEnabled) return;

    const payload = {
      title: `Answer: ${question.title}`,
      body: answerContent,
      data: {
        questionId,
        responderId,
        responderUsername: responder.username,
        // responderRatings: responder.ratings.value // include responder rating here
      }
    };
    await sendNotification(user.deviceToken, payload);
  } catch (error) {
    console.error('Failed to send question to nearby users', error);
  }
};

export default sendAnswerToquestionCreator;