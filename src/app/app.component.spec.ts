import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads the links and renders the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    http.expectOne('http://localhost:3000/api/links').flush([]);

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Make long links');
  });

  it('validates HTTP and HTTPS URLs before submission', () => {
    const component = TestBed.createComponent(AppComponent).componentInstance;

    component.urlControl.setValue('   ');
    expect(component.urlControl.hasError('required')).toBeTrue();

    component.urlControl.setValue('ftp://example.com');
    expect(component.urlControl.invalid).toBeTrue();

    component.urlControl.setValue('https://example.com/path');
    expect(component.urlControl.valid).toBeTrue();
  });

  it('creates a link and refreshes the list', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.componentInstance.urlControl.setValue('https://example.com/article');
    fixture.componentInstance.submit();

    http.expectOne((request) =>
      request.method === 'POST' && request.url === 'http://localhost:3000/api/links'
    ).flush({
      code: 'abc123',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/abc123',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    http.expectOne('http://localhost:3000/api/links').flush([{
      code: 'abc123',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/abc123',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    }]);

    expect(fixture.componentInstance.createdLink()?.code).toBe('abc123');
    expect(fixture.componentInstance.links()).toHaveSize(1);
  });

  it('shows backend validation errors beside the URL field', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.componentInstance.urlControl.setValue('https://example.com');
    fixture.componentInstance.submit();

    http.expectOne((request) => request.method === 'POST').flush(
      { error: 'URL is invalid' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(fixture.componentInstance.apiError()).toBe('URL is invalid');
    expect(fixture.componentInstance.urlDescriptionIds).toContain('api-error');
  });
});
