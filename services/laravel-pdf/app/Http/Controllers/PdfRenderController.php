<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Blade;
use Throwable;

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

    public function invoiceHtml(Request $request): JsonResponse
    {
        return $this->renderDocumentHtml($request, 'invoice');
    }

    public function estimateHtml(Request $request): JsonResponse
    {
        return $this->renderDocumentHtml($request, 'estimate');
    }

    public function invoiceBladeSource(): JsonResponse
    {
        $path = resource_path('views/invoices/pdf.blade.php');
        if (!is_readable($path)) {
            abort(404, 'Built-in invoice Blade template not found');
        }

        return response()->json([
            'view' => 'invoices/pdf',
            'bladeSource' => file_get_contents($path),
        ]);
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function renderDocument(Request $request, string $defaultType): Response
    {
        [$documentType, $data, $paper, $margins, $bladeSource] = $this->parseRequest($request, $defaultType);

        try {
            $html = $this->compileHtml($documentType, $data, $paper, $margins, $bladeSource);
        } catch (Throwable $e) {
            report($e);
            abort(422, 'Blade template failed to compile: '.$e->getMessage());
        }

        $pdf = Pdf::loadHTML($html);
        $pdf->setPaper($paper, 'portrait');

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="document.pdf"',
            'X-Powered-By' => 'DORINC-Laravel-DomPDF',
        ]);
    }

    private function renderDocumentHtml(Request $request, string $defaultType): JsonResponse
    {
        [$documentType, $data, $paper, $margins, $bladeSource] = $this->parseRequest($request, $defaultType);

        try {
            $html = $this->compileHtml($documentType, $data, $paper, $margins, $bladeSource);
        } catch (Throwable $e) {
            report($e);
            abort(422, 'Blade template failed to compile: '.$e->getMessage());
        }

        return response()->json([
            'html' => $html,
            'documentType' => $documentType,
        ]);
    }

    /**
     * @return array{0: string, 1: array<string, mixed>, 2: string, 3: array{top: float, right: float, bottom: float, left: float}, 4: ?string}
     */
    private function parseRequest(Request $request, string $defaultType): array
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
            'options.bladeSource' => 'sometimes|nullable|string|max:500000',
        ]);

        $documentType = $validated['documentType'] ?? $defaultType;
        $data = $validated['data'];
        $options = $validated['options'] ?? [];

        $paper = $this->normalizePaper(is_string($options['paper'] ?? null) ? $options['paper'] : 'letter');
        $margins = $this->resolveMargins(is_array($options['margins'] ?? null) ? $options['margins'] : []);
        $bladeSource = isset($options['bladeSource']) && is_string($options['bladeSource'])
            ? trim($options['bladeSource'])
            : null;
        if ($bladeSource === '') {
            $bladeSource = null;
        }

        return [$documentType, $data, $paper, $margins, $bladeSource];
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array{top: float, right: float, bottom: float, left: float}  $margins
     */
    private function compileHtml(
        string $documentType,
        array $data,
        string $paper,
        array $margins,
        ?string $bladeSource,
    ): string {
        $viewData = [
            'doc' => $data,
            'margins' => $margins,
            'paper' => $paper,
        ];

        if ($bladeSource !== null) {
            return Blade::render($bladeSource, $viewData);
        }

        $view = $documentType === 'estimate' ? 'estimates.pdf' : 'invoices.pdf';

        return view($view, $viewData)->render();
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
