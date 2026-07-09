import TLocation from "./location.types";

export enum QuestionStatus {
  Open = 'OPEN',
  Assigned = 'ASSIGNED',
  Answered = 'ANSWERED',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

export type TQuestion = {
  id: string;
  address: string;
  longitude: TLocation["longitude"];
  latitude: TLocation["latitude"];
  text: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: QuestionStatus;
  answer?: string;
  answerRating?: number;
  responderUsername?: string;
  claimedByUserId?: string;
  assignedResponderId?: string;
  assignedAt?: string;
  timeToRespondMs?: number;
  expiredAt?: string;
};

export default TQuestion;
