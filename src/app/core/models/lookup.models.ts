export interface Company {
  DataArea: string;
  Name: string;
  KnownAs: string;
  LanguageId: string;
  PartyNumber: string;
}

export interface Currency {
  CurrencyCode: string;
  Name: string;
  Symbol: string;
}

// TODO: expand fields once API response is confirmed
export interface Customer {
  CustomerAccount: string;
  CustomerName: string;
  CurrencyCode: string;
}

export interface ODataResponse<T> {
  'value': T[];
  '@odata.count'?: number;
}
