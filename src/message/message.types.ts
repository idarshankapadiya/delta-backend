export interface ContactMessage {
  id: string;
  name: string;
  mobile: string;
  email: string;
  message: string;
  created_at: string;
}

export interface CreateContactMessageInput {
  name: string;
  mobile: string;
  email: string;
  message: string;
}

export interface CreateContactMessageResponse extends ContactMessage {
  ok: true;
}

export interface ContactMessageListResponse {
  messages: ContactMessage[];
}
