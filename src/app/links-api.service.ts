import { HttpClient } from '@angular/common/http';
import { Injectable, isDevMode } from '@angular/core';
import { Observable } from 'rxjs';

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private readonly apiBaseUrl = isDevMode() ? 'http://localhost:3000' : '';

  constructor(private readonly http: HttpClient) {}

  createLink(url: string): Observable<Link> {
    return this.http.post<Link>(`${this.apiBaseUrl}/api/links`, { url });
  }

  getLinks(): Observable<Link[]> {
    return this.http.get<Link[]>(`${this.apiBaseUrl}/api/links`);
  }
}
