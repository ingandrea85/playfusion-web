export interface ParticipantDirectory {
  exists(participantRef: string): Promise<boolean>;
  add(participantRef: string): Promise<void>;
}
