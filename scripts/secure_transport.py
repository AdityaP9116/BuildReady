"""Provider credentials never follow redirects. Injected openers are for tests."""
from urllib.request import HTTPRedirectHandler, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def bounded_opener(request, *, timeout):
    return build_opener(NoRedirect()).open(request, timeout=timeout)
