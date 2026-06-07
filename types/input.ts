export interface BuyerInput {
  name: string;
  email: string;
  phone?: string;
  environment?: string;
  budget?: string;
  message?: string;
}

export interface ArtistInput {
  name: string;
  portfolio: string;
  city?: string;
}

export interface ProjectInput {
  name: string;
  email: string;
  environment?: string;
  budget?: string;
}
