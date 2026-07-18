<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Symfony\Component\HttpFoundation\Response;

class PdfRenderController extends Controller
{
    public function invoice(Request $request): Response
    {
        return $this->renderDocument($request, 'invoice', 'pdf');
    }

    public function invoiceHtml(Request $request): Response
    {
        return $this->renderDocument($request, 'invoice', 'html');
    }

    public function estimate(Request $request): Response
    {
        return $this->renderDocument($request, 'estimate', 'pdf');
    }

    public function estimateHtml(Request $request): Response
    {
        return $this->renderDocument($request, 'estimate', 'html');
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function renderDocument(Request $request, string $defaultType, string $format): Response
    {
        try {
            return $this->renderDocumentInner($request, $defaultType, $format);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function renderDocumentInner(Request $request, string $defaultType, string $format): Response
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
            'options.bladeSource' => 'sometimes|string|max:500000',
        ]);

        $documentType = $validated['documentType'] ?? $defaultType;
        $data = $validated['data'];
        $options = $validated['options'] ?? [];

        $paper = $this->normalizePaper(is_string($options['paper'] ?? null) ? $options['paper'] : 'letter');
        $margins = $this->resolveMargins(is_array($options['margins'] ?? null) ? $options['margins'] : []);
        $bladeSource = is_string($options['bladeSource'] ?? null) ? trim($options['bladeSource']) : '';

        $viewData = [
            'doc' => $data,
            'margins' => $margins,
            'paper' => $paper,
        ];

        if ($format === 'html') {
            $html = $bladeSource !== ''
                ? Blade::render($bladeSource, $viewData)
                : view($documentType === 'estimate' ? 'estimates.pdf' : 'invoices.pdf', $viewData)->render();

            return response($html, 200, [
                'Content-Type' => 'text/html; charset=UTF-8',
                'Cache-Control' => 'no-store',
            ]);
        }

        if ($bladeSource !== '') {
            $html = Blade::render($bladeSource, $viewData);
        }
        else {
            $view = $documentType === 'estimate' ? 'estimates.pdf' : 'invoices.pdf';
            $html = view($view, $viewData)->render();
        }

        $html = $this->injectMarginSafetyNet($html, $margins);
        if ($documentType === 'invoice') {
            $html = $this->injectPageNumberFooter($html);
        }
        $pdf = Pdf::loadHTML($html);

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

    /**
     * Inject a canonical @page margin rule as a safety net.
     * This ensures margins apply even when a template's @page is missing or malformed.
     * The injected rule is placed at the end of <head> so template rules can override if valid.
     *
     * @param  array{top: float, right: float, bottom: float, left: float}  $margins
     */
    private function injectMarginSafetyNet(string $html, array $margins): string
    {
        $m = sprintf(
            '@page { margin: %.3fin %.3fin %.3fin %.3fin; }',
            $margins['top'],
            $margins['right'],
            $margins['bottom'],
            $margins['left']
        );
        $style = '<style data-safety-net="margin">' . $m . '</style>';

        if (stripos($html, '</head>') !== false) {
            return preg_replace('/<\/head>/i', $style . '</head>', $html, 1);
        }

        if (stripos($html, '<body') !== false) {
            return preg_replace('/<body/i', $style . '<body', $html, 1);
        }

        return $style . $html;
    }

    /**
     * Fixed footer on every page — DomPDF replaces {PAGE_NUM} and {PAGE_COUNT} at render time.
     */
    private function injectPageNumberFooter(string $html): string
    {
        $footer = '<div style="position:fixed;bottom:0.12in;left:0;right:0;text-align:center;font-size:7pt;color:#707070;font-family:DejaVu Sans,Helvetica,Arial,sans-serif;">(pg {PAGE_NUM} of {PAGE_COUNT})</div>';

        if (stripos($html, '</body>') !== false) {
            return preg_replace('/<\/body>/i', $footer . '</body>', $html, 1);
        }

        return $html . $footer;
    }
}
