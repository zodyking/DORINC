<?php
/**
 * DORINC Laravel PDF service — DomPDF HTML → PDF (InvoiceShelf / barryvdh/laravel-dompdf engine).
 */

declare(strict_types=1);

use Dompdf\Dompdf;
use Dompdf\Options;

require dirname(__DIR__) . '/vendor/autoload.php';

header('X-Powered-By: DORINC-Laravel-PDF');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($method === 'GET' && ($path === '/health' || $path === '/')) {
    header('Content-Type: application/json');
    echo json_encode([
        'ok' => true,
        'service' => 'laravel-pdf',
        'engine' => 'dompdf',
        'wrapper' => 'barryvdh/laravel-dompdf-compatible',
    ]);
    exit;
}

if ($method !== 'POST' || $path !== '/render') {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'Not found']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'Expected JSON body']);
    exit;
}

$html = $payload['html'] ?? null;
if (!is_string($html) || trim($html) === '') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'html is required']);
    exit;
}

$paper = is_string($payload['paper'] ?? null) ? strtolower($payload['paper']) : 'letter';
$margins = is_array($payload['margins'] ?? null) ? $payload['margins'] : [];

$options = new Options();
$options->set('isRemoteEnabled', true);
$options->set('isHtml5ParserEnabled', true);
$options->set('defaultFont', 'DejaVu Sans');

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html);
$dompdf->setPaper($paper, 'portrait');

$marginTop = isset($margins['top']) ? (float) $margins['top'] : 0.5;
$marginRight = isset($margins['right']) ? (float) $margins['right'] : 0.5;
$marginBottom = isset($margins['bottom']) ? (float) $margins['bottom'] : 0.5;
$marginLeft = isset($margins['left']) ? (float) $margins['left'] : 0.5;

$dompdf->set_option('defaultPaperMargins', [
    'top' => $marginTop,
    'right' => $marginRight,
    'bottom' => $marginBottom,
    'left' => $marginLeft,
]);

try {
    $dompdf->render();
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
    exit;
}

header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="document.pdf"');
echo $dompdf->output();
