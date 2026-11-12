import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { Link, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return { required: true };
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, httpUrlValidator],
  });
  readonly links = signal<Link[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly listError = signal('');
  readonly apiError = signal('');
  readonly createdLink = signal<Link | null>(null);

  constructor(private readonly linksApi: LinksApiService) {}

  get urlDescriptionIds(): string {
    const ids = [
      this.urlControl.invalid && this.urlControl.touched ? 'url-error' : 'url-hint',
    ];
    if (this.apiError()) {
      ids.push('api-error');
    }
    return ids.join(' ');
  }

  ngOnInit(): void {
    this.loadLinks();
  }

  submit(): void {
    this.urlControl.markAsTouched();
    if (this.urlControl.invalid || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.apiError.set('');
    this.createdLink.set(null);

    this.linksApi
      .createLink(this.urlControl.value.trim())
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (link) => {
          this.createdLink.set(link);
          this.urlControl.reset();
          this.loadLinks();
        },
        error: (error: unknown) => this.apiError.set(this.errorMessage(error)),
      });
  }

  loadLinks(): void {
    this.isLoading.set(true);
    this.listError.set('');

    this.linksApi
      .getLinks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: (error: unknown) => this.listError.set(this.errorMessage(error)),
      });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object') {
      const message = (error.error as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Could not reach Snip. Check your connection and try again.';
  }
}
