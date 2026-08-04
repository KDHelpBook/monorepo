//! Ordering content versions (`meta.version`) the way the viewer does.
//!
//! `pack`/`patch` group the editions of one book into a single manifest entry and
//! must agree with the viewer on which of them is the current one — the viewer
//! shows the highest version by its own comparison, so a different order here
//! would leave the entry's `file`/`hash`/`version` describing a book the reader
//! never sees.
//!
//! Mirrors `compareVersions` in viewer-ts/src/data/versions.ts and
//! registry/src/versions.ts. Keep the three in sync; their test cases are
//! deliberately the same.

use std::cmp::Ordering;

/// Compare two dotted versions numerically where possible (`1.10.0 > 1.2.0`),
/// falling back to string comparison for non-numeric segments (which therefore
/// sort *above* numeric ones). Missing trailing segments count as 0
/// (`1.2 == 1.2.0`).
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    let pa: Vec<&str> = a.split('.').collect();
    let pb: Vec<&str> = b.split('.').collect();
    for i in 0..pa.len().max(pb.len()) {
        let sa = pa.get(i).copied().unwrap_or("0");
        let sb = pb.get(i).copied().unwrap_or("0");
        match (parse_segment(sa), parse_segment(sb)) {
            // Both numeric: order by value (both are finite, so partial_cmp is total).
            (Some(na), Some(nb)) if na != nb => {
                return na.partial_cmp(&nb).unwrap_or(Ordering::Equal)
            }
            (Some(_), Some(_)) => {}
            _ if sa != sb => return sa.cmp(sb),
            _ => {}
        }
    }
    Ordering::Equal
}

/// A segment JavaScript's `Number()` would read as a finite number — the same
/// rule the two TypeScript implementations apply (an empty segment is 0 there).
fn parse_segment(segment: &str) -> Option<f64> {
    if segment.is_empty() {
        return Some(0.0);
    }
    segment.parse::<f64>().ok().filter(|n| n.is_finite())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_numerically_not_lexically() {
        assert_eq!(compare_versions("1.10.0", "1.2.0"), Ordering::Greater);
        assert_eq!(compare_versions("1.2.0", "1.10.0"), Ordering::Less);
        assert_eq!(compare_versions("2.0.0", "2.0.0"), Ordering::Equal);
    }

    #[test]
    fn treats_missing_trailing_segments_as_zero() {
        assert_eq!(compare_versions("1.2", "1.2.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.2.1", "1.2"), Ordering::Greater);
    }

    #[test]
    fn falls_back_to_string_compare_for_non_numeric_segments() {
        assert_eq!(
            compare_versions("1.0.0-beta", "1.0.0-alpha"),
            Ordering::Greater
        );
        assert_eq!(compare_versions("latest", "9.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.0.0-beta", "1.0.0"), Ordering::Greater);
    }

    #[test]
    fn an_absent_version_sorts_below_any_release() {
        assert_eq!(compare_versions("", "0.1.0"), Ordering::Less);
    }
}
