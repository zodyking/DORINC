<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PdfRenderController extends Controller
{
    public function invoice(Request $request): Response
    {
        return $this->renderDocument($request, 'invoice');
    }

    public function estimate(Request $request): Response
    {
        return $this->renderDocument($request, 'estimate');
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function renderDocument(Request $request, string $defaultType): Response
    {
        $validated = $request->validate([
            'documentType' => 'sometimes|string|in:invoice,estimate',
            'data' => 'required|array',
            'options' => 'sometimes|array',
            'options.paper' => 'sometimes|string',
            'options.margins' => 'sometimes|array',
            'options.margins.top' => 'sometimes|numeric',
            'options.margins.right' => 'sometimes|numeric',
            'options.margins.bottom' => 'sometimes|numeric',
            'options.margins.left' => 'sometimes|numeric',
        ]);

        $documentType = $validated['documentType'] ?? $defaultType;
        $data = $validated['data'];
        $options = $validated['options'] ?? [];

        $paper = $this->normalizePaper(is_string($options['paper'] ?? null) ? $options['paper'] : 'letter');
        $margins = $this->resolveMargins(is_array($options['margins'] ?? null) ? $options['margins'] : []);

        $view = $documentType === 'estimate' ? 'estimates.pdf' : 'invoices.pdf';

        $pdf = Pdf::loadView($view, [
            'doc' => $data,
            'margins' => $margins,
            'paper' => $paper,
        ]);
        $pdf->setPaper($paper, 'portrait');

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="document.pdf"',
            'X-Powered-By' => 'DORINC-Laravel-DomPDF',
        ]);
    }

    private function normalizePaper(string $paper): string
    {
        return strtolower(trim($paper)) === 'a4' ? 'a4' : 'letter';
    }

    /**
     * @param  array<string, mixed>  $margins
     * @return array{top: float, right: float, bottom: float, left: float}
     */
    private function resolveMargins(array $margins): array
    {
        $fallback = 0.5;

        return [
            'top' => (float) ($margins['top'] ?? $fallback),
            'right' => (float) ($margins['right'] ?? $fallback),
            'bottom' => (float) ($margins['bottom'] ?? $fallback),
            'left' => (float) ($margins['left'] ?? $fallback),
        ];
    }
}
